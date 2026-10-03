import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const UNPAID_TTL_MS = DAY_MS;
const PAID_TTL_MS = 7 * DAY_MS;
const PAID_FAILED_TTL_MS = 3 * DAY_MS;
const WEBHOOK_EVENT_TTL_MS = 30 * DAY_MS;

type OrderStatus = OrderRow["status"];

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

// Apaga a linha só se ela ainda tem o status e a idade esperados; devolve a foto das linhas realmente apagadas.
export async function deleteGuarded(ctx: OrderContext, id: string, statuses: OrderStatus[], createdBefore: Date): Promise<{ photoKey: string | null } | null> {
  const [deleted] = await ctx.db
    .delete(orders)
    .where(and(eq(orders.id, id), inArray(orders.status, statuses), lt(orders.createdAt, createdBefore)))
    .returning({ id: orders.id, photoKey: orders.photoKey });

  return deleted ?? null;
}

// Confirma na AbacatePay antes de apagar; devolve true se o pedido foi apagado.
async function deleteUnconfirmed(ctx: OrderContext, row: OrderRow, statuses: OrderStatus[], createdBefore: Date, deletedMessage: string | null): Promise<boolean> {
  let current: OrderRow | null;

  try {
    current = await syncOrder(ctx, row.id);
  } catch (error) {
    ctx.logger.warn({ err: error, orderRef: orderRef(row.id) }, "Não consegui consultar a AbacatePay na limpeza; tento de novo na próxima");

    return false;
  }

  if (!current || !statuses.includes(current.status)) {
    return false;
  }

  const deleted = await deleteGuarded(ctx, row.id, statuses, createdBefore);

  if (!deleted) {
    return false;
  }

  if (deletedMessage) {
    ctx.logger.warn({ orderRef: orderRef(row.id) }, deletedMessage);
  }

  const removed = await removeQuietly(ctx, deleted.photoKey);

  if (!removed) {
    ctx.logger.warn({ orderRef: orderRef(row.id) }, "Foto órfã; a regra de ciclo de vida do MinIO apaga em 2 dias");
  }

  return true;
}

export async function cleanupOrders(ctx: OrderContext): Promise<{ removed: number; webhookEventsRemoved: number }> {
  const now = ctx.now().getTime();
  let removed = 0;

  const unpaidBefore = new Date(now - UNPAID_TTL_MS);
  const unpaid = await ctx.db
    .select()
    .from(orders)
    .where(and(inArray(orders.status, ["pending", "expired"]), lt(orders.createdAt, unpaidBefore)));

  for (const row of unpaid) {
    if (await deleteUnconfirmed(ctx, row, ["pending", "expired"], unpaidBefore, null)) {
      removed += 1;
    }
  }

  const paidBefore = new Date(now - PAID_TTL_MS);
  const paidOld = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), or(lt(orders.paidAt, paidBefore), and(isNull(orders.paidAt), lt(orders.createdAt, paidBefore)))));

  for (const row of paidOld) {
    const resultRemoved = await removeQuietly(ctx, row.resultKey);
    const photoRemoved = await removeQuietly(ctx, row.photoKey);

    if (!resultRemoved || !photoRemoved) {
      ctx.logger.warn({ orderRef: orderRef(row.id) }, "Não apaguei o pedido pago porque a remoção do arquivo falhou; tento de novo na próxima");

      continue;
    }

    await ctx.db
      .delete(orders)
      .where(and(eq(orders.id, row.id), eq(orders.status, "paid")));

    removed += 1;
  }

  const failedBefore = new Date(now - PAID_FAILED_TTL_MS);
  const failedOld = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid_failed"), lt(orders.createdAt, failedBefore)));

  for (const row of failedOld) {
    if (await deleteUnconfirmed(ctx, row, ["paid_failed"], failedBefore, "Pedido pago sem imagem, apagado")) {
      removed += 1;
    }
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

  return { removed, webhookEventsRemoved: oldEvents.length };
}
