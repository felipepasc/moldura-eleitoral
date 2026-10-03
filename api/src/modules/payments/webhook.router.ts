import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { badReq, ok, unauthorized } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const PAID_EVENTS = new Set(["transparent.completed", "billing.paid", "checkout.completed"]);
const MAX_DEPTH = 6;

const QuerySchema = z.object({
  webhookSecret: z.string().optional(),
  secret: z.string().optional(),
});

const BodySchema = z.object({
  event: z.string(),
  id: z.string().optional(),
  data: z.unknown().optional(),
});

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();

  return timingSafeEqual(hashA, hashB);
}

function collectIds(value: unknown, found: string[] = [], depth = 0): string[] {
  if (depth > MAX_DEPTH || !value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, found, depth + 1);
    }

    return found;
  }

  for (const [key, child] of Object.entries(value)) {
    if ((key === "id" || key === "externalId") && typeof child === "string") {
      found.push(child);
    } else {
      collectIds(child, found, depth + 1);
    }
  }

  return found;
}

export function webhookRouter(ctx: OrderContext, secret: string): FastifyPluginAsync {
  return async (app) => {
    app.post("/abacatepay", async (req, reply) => {
      const query = QuerySchema.safeParse(req.query);
      const provided = query.success ? (query.data.webhookSecret ?? query.data.secret ?? "") : "";

      if (!safeEqual(provided, secret)) {
        return unauthorized(reply, "invalid_secret");
      }

      const body = BodySchema.safeParse(req.body);

      if (!body.success) {
        return badReq(reply, "Evento inválido.");
      }

      const ids = collectIds(req.body);
      const eventId = `${body.data.event}:${body.data.id ?? ids[0] ?? "sem-id"}`;

      const inserted = await ctx.db
        .insert(webhookEvents)
        .values({ eventId, event: body.data.event, payload: req.body })
        .onConflictDoNothing()
        .returning({ eventId: webhookEvents.eventId });

      if (inserted.length === 0) {
        return ok(reply, { received: true, duplicate: true });
      }

      if (!PAID_EVENTS.has(body.data.event)) {
        return ok(reply, { received: true, processed: false });
      }

      const [order] =
        ids.length > 0
          ? await ctx.db
              .select()
              .from(orders)
              .where(inArray(orders.pixId, ids))
              .limit(1)
          : [];

      if (!order) {
        ctx.logger.warn({ event: body.data.event }, "Webhook de pagamento sem pedido correspondente");

        return ok(reply, { received: true, processed: false });
      }

      try {
        await syncOrder(ctx, order.id);
      } catch (error) {
        ctx.logger.error({ err: error, orderId: order.id }, "Falha ao sincronizar o pedido pelo webhook");

        return ok(reply, { received: true, processed: false });
      }

      return ok(reply, { received: true, processed: true });
    });
  };
}
