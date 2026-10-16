import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { verifyWebhook } from "@felipepasc/core-sdk";
import type { CoreWebhookEvent } from "@felipepasc/core-sdk";
import { badReq, ok } from "@/core/http-fastify";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const BODY_LIMIT_BYTES = 256 * 1024;
const PAID_EVENT = "charge.paid";

function chargeIdOf(event: CoreWebhookEvent): string | null {
  if (event.type !== PAID_EVENT) {
    return null;
  }

  const id = event.data?.externalId;

  return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
}

export function coreWebhookRouter(ctx: OrderContext, secret: string, perMinute: number): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onSend", async (_req, reply) => {
      reply.header("Cache-Control", "no-store");
    });

    // Só nesta rota: o corpo chega cru (a assinatura vale sobre os bytes exatos).
    app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: BODY_LIMIT_BYTES }, (_req, body, done) => {
      done(null, body);
    });

    const options = { bodyLimit: BODY_LIMIT_BYTES, config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } };

    app.post("/core", options, async (req, reply) => {
      const raw = typeof req.body === "string" ? req.body : "";
      let event: CoreWebhookEvent;

      try {
        event = await verifyWebhook({ payload: raw, headers: req.headers, secret });
      } catch {
        // Assinatura que não confere, aviso velho ou corpo que não é JSON.
        return badReq(reply, "Evento inválido.");
      }

      if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
        return badReq(reply, "Evento inválido.");
      }

      const chargeId = chargeIdOf(event);

      if (!chargeId) {
        return ok(reply, { received: true, processed: false });
      }

      const eventId = `core:${event.id}`.slice(0, 200);

      const inserted = await ctx.db
        .insert(webhookEvents)
        .values({ eventId, event: event.type })
        .onConflictDoNothing()
        .returning({ eventId: webhookEvents.eventId });

      if (inserted.length === 0) {
        return ok(reply, { received: true, duplicate: true });
      }

      const [order] = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.pixId, chargeId))
        .limit(1);

      if (!order) {
        // Cobrança de outra origem (painel) ou pedido já apagado: confirma para o Core não repetir.
        ctx.logger.warn({ event: event.type }, "Webhook de pagamento sem pedido correspondente");

        return ok(reply, { received: true, processed: false });
      }

      async function releaseEvent() {
        try {
          await ctx.db
            .delete(webhookEvents)
            .where(eq(webhookEvents.eventId, eventId));
        } catch (deleteError) {
          ctx.logger.error({ err: deleteError }, "Não consegui liberar o evento do webhook");
        }
      }

      try {
        // Sempre reconsulta a cobrança no Core antes de liberar o pedido.
        const synced = await syncOrder(ctx, order.id, { force: true });

        if (synced?.status !== "paid") {
          // O Core repete o aviso até receber 2xx: libera o evento e pede reenvio.
          ctx.logger.warn({ event: event.type, orderRef: orderRef(order.id) }, "Webhook de pagamento sem confirmação na consulta; pedindo reenvio");
          await releaseEvent();

          return reply.code(503).send({ error: "Tente novamente." });
        }
      } catch (error) {
        ctx.logger.error({ err: error, event: event.type, orderRef: orderRef(order.id) }, "Falha ao sincronizar o pedido pelo webhook");
        await releaseEvent();

        return reply.code(503).send({ error: "Tente novamente." });
      }

      return ok(reply, { received: true, processed: true });
    });
  };
}
