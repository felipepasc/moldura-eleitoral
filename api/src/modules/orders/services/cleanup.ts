import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { forgetOrder, syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const UNPAID_TTL_MS = DAY_MS;
const PAID_TTL_MS = 7 * DAY_MS;
const PAID_FAILED_TTL_MS = 3 * DAY_MS;
const UNPAID_HARD_CAP_MS = 3 * DAY_MS;
const PAID_FAILED_HARD_CAP_MS = 5 * DAY_MS;
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

type DeletePolicy = {
  statuses: OrderStatus[];
  softBefore: Date;
  hardBefore: Date;
  deletedMessage: string | null;
};

// Confirma no Core antes de apagar; se a consulta falhar, só o teto máximo de retenção apaga mesmo assim.
async function deleteUnconfirmed(ctx: OrderContext, row: OrderRow, policy: DeletePolicy): Promise<boolean> {
  const beyondHardCap = row.createdAt < policy.hardBefore;
  let unconfirmed = false;

  try {
    const current = await syncOrder(ctx, row.id, { force: true });

    if (!current || !policy.statuses.includes(current.status)) {
      return false;
    }

    if (current.status === "paid_failed") {
      await ctx.gateway.checkPix(current.pixId);
    }
  } catch (error) {
    ctx.logger.warn({ err: error, orderRef: orderRef(row.id) }, "Não consegui consultar o Core na limpeza");

    if (!beyondHardCap) {
      return false;
    }

    unconfirmed = true;
  }

  const deleted = await deleteGuarded(ctx, row.id, policy.statuses, policy.softBefore);

  if (!deleted) {
    return false;
  }

  forgetOrder(ctx, row.id);

  if (unconfirmed && !policy.deletedMessage) {
    // Pode ter pago sem a api saber: o pixId deixa o operador conferir no painel do Core (evento com pixId, junto com os de pago sem imagem).
    ctx.logger.warn({ orderRef: orderRef(row.id), pixId: row.pixId }, "Pedido não pago apagado pelo teto sem confirmação");
  }

  if (policy.deletedMessage) {
    // Segundo e último log com pixId: o operador acha a cobrança no Core por ele e reembolsa no provedor.
    ctx.logger.warn({ orderRef: orderRef(row.id), pixId: row.pixId }, policy.deletedMessage);
  }

  const removed = await removeQuietly(ctx, deleted.photoKey);

  if (!removed) {
    ctx.logger.warn({ orderRef: orderRef(row.id) }, "Foto órfã; a regra de ciclo de vida do MinIO apaga em 4 dias");
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
    const policy = { statuses: ["pending", "expired"] as OrderStatus[], softBefore: unpaidBefore, hardBefore: new Date(now - UNPAID_HARD_CAP_MS), deletedMessage: null };

    if (await deleteUnconfirmed(ctx, row, policy)) {
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

    const deletedPaid = await ctx.db
      .delete(orders)
      .where(and(eq(orders.id, row.id), eq(orders.status, "paid")))
      .returning({ id: orders.id });

    forgetOrder(ctx, row.id);
    removed += deletedPaid.length;
  }

  const failedBefore = new Date(now - PAID_FAILED_TTL_MS);
  const failedOld = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid_failed"), lt(orders.createdAt, failedBefore)));

  for (const row of failedOld) {
    const policy = { statuses: ["paid_failed"] as OrderStatus[], softBefore: failedBefore, hardBefore: new Date(now - PAID_FAILED_HARD_CAP_MS), deletedMessage: "Pedido pago sem imagem apagado" };

    if (await deleteUnconfirmed(ctx, row, policy)) {
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
