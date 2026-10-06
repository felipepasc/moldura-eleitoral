import { createPublicKey, verify } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { badReq, ok, unauthorized } from "@/core/http-fastify";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const BODY_LIMIT_BYTES = 256 * 1024;
const COMPLETED_EVENT = "OPENPIX:CHARGE_COMPLETED";

// Chave pública oficial da Woovi (developers.woovi.com, validação de assinatura de webhook).
export const WOOVI_PUBLIC_KEY_PEM = [
  "-----BEGIN PUBLIC KEY-----",
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/+NtIkjzevvqD+I3MMv3bLXDt",
  "pvxBjY4BsRrSdca3rtAwMcRYYvxSnd7jagVLpctMiOxQO8ieUCKLSWHpsMAjO/zZ",
  "WMKbqoG8MNpi/u3fp6zz0mcHCOSqYsPUUG19buW8bis5ZZ2IZgBObWSpTvJ0cnj6",
  "HKBAA82Jln+lGwS1MwIDAQAB",
  "-----END PUBLIC KEY-----",
  "",
].join("\n");

// Aceita PEM (inclusive com \n literais) ou o PEM em base64.
export function normalizePublicKey(value: string): string {
  const text = value.includes("BEGIN") ? value.replace(/\\n/g, "\n") : Buffer.from(value, "base64").toString("utf8");

  return `${text.trim()}\n`;
}

const BodySchema = z.object({
  event: z.string().max(200),
  charge: z.object({ correlationID: z.string().min(1).max(200).optional() }).optional(),
});

function hasValidSignature(raw: Buffer, signature: unknown, publicKeyPem: string): boolean {
  if (typeof signature !== "string" || signature.length === 0 || signature.length > 4096) {
    return false;
  }

  try {
    return verify("sha256", raw, createPublicKey(publicKeyPem), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function wooviWebhookRouter(ctx: OrderContext, publicKeyPem: string, perMinute: number): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onSend", async (_req, reply) => {
      reply.header("Cache-Control", "no-store");
    });

    // Só nesta rota: o corpo chega cru (a assinatura vale sobre os bytes exatos).
    app.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: BODY_LIMIT_BYTES }, (_req, body, done) => {
      done(null, body);
    });

    const options = { bodyLimit: BODY_LIMIT_BYTES, config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } };

    app.post("/woovi", options, async (req, reply) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      if (!hasValidSignature(raw, req.headers["x-webhook-signature"], publicKeyPem)) {
        return unauthorized(reply, "Não autorizado.");
      }

      let json: unknown;

      try {
        json = JSON.parse(raw.toString("utf8"));
      } catch {
        return badReq(reply, "Evento inválido.");
      }

      const body = BodySchema.safeParse(json);

      if (!body.success) {
        return badReq(reply, "Evento inválido.");
      }

      const correlationId = body.data.charge?.correlationID;

      if (body.data.event !== COMPLETED_EVENT || !correlationId) {
        return ok(reply, { received: true, processed: false });
      }

      const eventId = `${body.data.event}:${correlationId}`;

      const inserted = await ctx.db
        .insert(webhookEvents)
        .values({ eventId, event: body.data.event })
        .onConflictDoNothing()
        .returning({ eventId: webhookEvents.eventId });

      if (inserted.length === 0) {
        return ok(reply, { received: true, duplicate: true });
      }

      const [order] = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.pixId, correlationId))
        .limit(1);

      if (!order) {
        ctx.logger.warn({ event: body.data.event }, "Webhook de pagamento sem pedido correspondente");

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
        // Sempre reconsulta a cobrança na Woovi antes de liberar o pedido.
        const synced = await syncOrder(ctx, order.id, { force: true });

        if (synced?.status !== "paid") {
          // A Woovi ainda não confirma (ou a montagem falhou): libera o evento e responde 503 para ela reenviar.
          ctx.logger.warn({ event: body.data.event, orderRef: orderRef(order.id) }, "Webhook de pagamento sem confirmação na consulta; pedindo reenvio");
          await releaseEvent();

          return reply.code(503).send({ error: "Tente novamente." });
        }
      } catch (error) {
        ctx.logger.error({ err: error, event: body.data.event, orderRef: orderRef(order.id) }, "Falha ao sincronizar o pedido pelo webhook");
        await releaseEvent();

        return reply.code(503).send({ error: "Tente novamente." });
      }

      return ok(reply, { received: true, processed: true });
    });
  };
}
