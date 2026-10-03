import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { badReq, ok, unauthorized } from "@/core/http-fastify";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const PAID_EVENTS = new Set(["transparent.completed", "billing.paid", "checkout.completed"]);
const MAX_DEPTH = 6;
const MAX_IDS = 20;
const BODY_LIMIT_BYTES = 256 * 1024;

const QuerySchema = z.object({
  webhookSecret: z.string().optional(),
});

const BodySchema = z.object({
  event: z.string().max(200),
  id: z.string().max(200).optional(),
  data: z.unknown().optional(),
});

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();

  return timingSafeEqual(hashA, hashB);
}

function collectIds(value: unknown, found: string[] = [], depth = 0): string[] {
  if (found.length >= MAX_IDS || depth > MAX_DEPTH || !value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, found, depth + 1);
    }

    return found;
  }

  for (const [key, child] of Object.entries(value)) {
    if (found.length >= MAX_IDS) {
      break;
    }

    if ((key === "id" || key === "externalId") && typeof child === "string") {
      found.push(child);
    } else {
      collectIds(child, found, depth + 1);
    }
  }

  return found;
}

function eventIdOf(event: string, id: string | undefined, rawBody: unknown): string {
  if (id) {
    return `${event}:${id}`;
  }

  const digest = createHash("sha256").update(JSON.stringify(rawBody)).digest("hex").slice(0, 32);

  return `${event}:${digest}`;
}

export function webhookRouter(ctx: OrderContext, secret: string, perMinute: number): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onSend", async (_req, reply) => {
      reply.header("Cache-Control", "no-store");
    });

    const options = { bodyLimit: BODY_LIMIT_BYTES, config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } };

    app.post("/abacatepay", options, async (req, reply) => {
      const query = QuerySchema.safeParse(req.query);
      const provided = query.success ? (query.data.webhookSecret ?? "") : "";

      if (!safeEqual(provided, secret)) {
        return unauthorized(reply, "invalid_secret");
      }

      const body = BodySchema.safeParse(req.body);

      if (!body.success) {
        return badReq(reply, "Evento inválido.");
      }

      const ids = collectIds(req.body);
      const eventId = eventIdOf(body.data.event, body.data.id, req.body);

      const inserted = await ctx.db
        .insert(webhookEvents)
        .values({ eventId, event: body.data.event })
        .onConflictDoNothing()
        .returning({ eventId: webhookEvents.eventId });

      if (inserted.length === 0) {
        return ok(reply, { received: true, duplicate: true });
      }

      if (!PAID_EVENTS.has(body.data.event)) {
        return ok(reply, { received: true, processed: false });
      }

      const matched =
        ids.length > 0
          ? await ctx.db
              .select({ id: orders.id })
              .from(orders)
              .where(inArray(orders.pixId, ids))
              .limit(MAX_IDS)
          : [];

      if (matched.length === 0) {
        ctx.logger.warn({ event: body.data.event }, "Webhook de pagamento sem pedido correspondente");

        return ok(reply, { received: true, processed: false });
      }

      try {
        for (const order of matched) {
          await syncOrder(ctx, order.id, { force: true });
        }
      } catch (error) {
        ctx.logger.error({ err: error, event: body.data.event, orderRefs: matched.map((order) => orderRef(order.id)) }, "Falha ao sincronizar o pedido pelo webhook");

        try {
          await ctx.db
            .delete(webhookEvents)
            .where(eq(webhookEvents.eventId, eventId));
        } catch (deleteError) {
          ctx.logger.error({ err: deleteError }, "Não consegui liberar o evento do webhook");
        }

        return reply.code(503).send({ error: "Tente novamente." });
      }

      return ok(reply, { received: true, processed: true });
    });
  };
}
