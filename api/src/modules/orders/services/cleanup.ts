import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const UNPAID_TTL_MS = DAY_MS;
const PAID_TTL_MS = 7 * DAY_MS;
const PAID_FAILED_TTL_MS = 14 * DAY_MS;
const WEBHOOK_EVENT_TTL_MS = 30 * DAY_MS;

type OrderRow = typeof orders.$inferSelect;

async function removeQuietly(ctx: OrderContext, key: string | null): Promise<boolean> {
  if (!key) {
    return true;
  }

  try {
    await ctx.storage.remove(key);

    return true;
  } catch (error) {
    ctx.logger.warn({ err: error }, "Não consegui apagar o arquivo na limpeza");

    return false;
  }
}

async function deleteOrder(ctx: OrderContext, row: OrderRow): Promise<void> {
  await removeQuietly(ctx, row.photoKey);
  await removeQuietly(ctx, row.resultKey);

  await ctx.db
    .delete(orders)
    .where(eq(orders.id, row.id));
}

export async function cleanupOrders(ctx: OrderContext): Promise<{ removed: number; webhookEventsRemoved: number }> {
  const now = ctx.now().getTime();

  const unpaid = await ctx.db
    .select()
    .from(orders)
    .where(and(inArray(orders.status, ["pending", "expired"]), lt(orders.createdAt, new Date(now - UNPAID_TTL_MS))));

  for (const row of unpaid) {
    await deleteOrder(ctx, row);
  }

  const paidOld = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), lt(orders.paidAt, new Date(now - PAID_TTL_MS))));

  for (const row of paidOld) {
    await deleteOrder(ctx, row);
  }

  const failedOld = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid_failed"), lt(orders.createdAt, new Date(now - PAID_FAILED_TTL_MS))));

  for (const row of failedOld) {
    ctx.logger.warn({ orderRef: orderRef(row.id) }, "Pedido pago sem imagem entregue foi apagado após 14 dias");

    await deleteOrder(ctx, row);
  }

  const paidLeftovers = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), isNotNull(orders.photoKey)));

  for (const row of paidLeftovers) {
    const removedPhoto = await removeQuietly(ctx, row.photoKey);

    if (!removedPhoto) {
      continue;
    }

    await ctx.db
      .update(orders)
      .set({ photoKey: null })
      .where(eq(orders.id, row.id));
  }

  const oldEvents = await ctx.db
    .delete(webhookEvents)
    .where(lt(webhookEvents.receivedAt, new Date(now - WEBHOOK_EVENT_TTL_MS)))
    .returning({ eventId: webhookEvents.eventId });

  return {
    removed: unpaid.length + paidOld.length + failedOld.length,
    webhookEventsRemoved: oldEvents.length,
  };
}
