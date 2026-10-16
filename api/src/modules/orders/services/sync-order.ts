import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { DEFAULT_FRAME_STYLE, findFrameStyle, frameFileName, frameHole, frameMaskFileName } from "@moldura/common";
import type { FrameStyleId } from "@moldura/common";
import { orderRef } from "@/core/log-ref";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { composeImage } from "@/modules/orders/services/compose";

const CHECK_INTERVAL_MS = 5_000;
const RECOMPOSE_INTERVAL_MS = 30_000;
const MAX_TRACKED_ORDERS = 5_000;

// NULL, modelo que o candidato não tem ou estilo antigo (molduras trocadas) caem no primeiro modelo.
function frameStyleOf(row: OrderRow): FrameStyleId {
  const style = row.frameStyle ? findFrameStyle(row.frameStyle, row.candidateId) : undefined;

  return style ? style.id : DEFAULT_FRAME_STYLE;
}

type Tracking = { checkedAt: number; recomposedAt: number };

const trackingByContext = new WeakMap<OrderContext, Map<string, Tracking>>();

function trackingOf(ctx: OrderContext): Map<string, Tracking> {
  let tracking = trackingByContext.get(ctx);

  if (!tracking) {
    tracking = new Map();
    trackingByContext.set(ctx, tracking);
  }

  return tracking;
}

function touch(ctx: OrderContext, id: string, field: keyof Tracking): void {
  const tracking = trackingOf(ctx);
  const now = ctx.now().getTime();

  if (!tracking.has(id) && tracking.size >= MAX_TRACKED_ORDERS) {
    for (const [key, entry] of tracking) {
      if (now - Math.max(entry.checkedAt, entry.recomposedAt) > RECOMPOSE_INTERVAL_MS) {
        tracking.delete(key);
      }
    }

    // ainda cheio: descarta o mais antigo (a ordem de inserção do Map)
    const oldest = tracking.keys().next();

    if (tracking.size >= MAX_TRACKED_ORDERS && !oldest.done) {
      tracking.delete(oldest.value);
    }
  }

  const entry = tracking.get(id) ?? { checkedAt: 0, recomposedAt: 0 };
  entry[field] = now;
  tracking.set(id, entry);
}

function isRecent(ctx: OrderContext, id: string, field: keyof Tracking, windowMs: number): boolean {
  const entry = trackingOf(ctx).get(id);

  return Boolean(entry && entry[field] > 0 && ctx.now().getTime() - entry[field] < windowMs);
}

export function forgetOrder(ctx: OrderContext, id: string): void {
  trackingOf(ctx).delete(id);
}

export function trackedOrderCount(ctx: OrderContext): number {
  return trackingOf(ctx).size;
}

export type SyncOptions = { force?: boolean };

export async function findOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  const [row] = await ctx.db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return row ?? null;
}

async function updateOrder(ctx: OrderContext, id: string, values: Partial<typeof orders.$inferInsert>, guard: SQL | undefined): Promise<OrderRow | null> {
  const [row] = await ctx.db
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, id), guard))
    .returning();

  if (row) {
    return row;
  }

  return findOrder(ctx, id);
}

async function removeQuietly(ctx: OrderContext, orderId: string, key: string): Promise<void> {
  try {
    await ctx.storage.remove(key);
  } catch (error) {
    ctx.logger.warn({ err: error, orderRef: orderRef(orderId) }, "Não consegui apagar a foto original");
  }
}

export async function confirmOrder(ctx: OrderContext, row: OrderRow): Promise<OrderRow> {
  if (row.status === "paid") {
    return row;
  }

  try {
    if (!row.photoKey) {
      throw new Error("Foto do pedido não encontrada.");
    }

    const photo = await ctx.storage.get(row.photoKey);
    const style = frameStyleOf(row);
    const hole = frameHole(row.candidateId, style);

    if (!hole) {
      throw new Error("Moldura do pedido não encontrada.");
    }

    const framePath = path.join(ctx.framesDir, frameFileName(row.candidateId, style));
    const maskPath = path.join(ctx.framesDir, frameMaskFileName(row.candidateId, style));
    const image = await composeImage(photo, row.framing, framePath, { maskPath, hole });
    const resultKey = `results/${row.id}.png`;

    await ctx.storage.put(resultKey, image, "image/png");

    const paid = await updateOrder(ctx, row.id, { status: "paid", resultKey, photoKey: null, paidAt: ctx.now() }, ne(orders.status, "paid"));
    await removeQuietly(ctx, row.id, row.photoKey);

    return paid ?? row;
  } catch (error) {
    ctx.logger.error({ err: error, orderRef: orderRef(row.id) }, "Falha ao montar a imagem do pedido");

    const failed = await updateOrder(ctx, row.id, { status: "paid_failed" }, ne(orders.status, "paid"));

    if (row.status !== "paid_failed") {
      // O operador acha a cobrança no Core pelo id e reembolsa no provedor: este é um dos dois únicos logs com pixId.
      ctx.logger.error({ orderRef: orderRef(row.id), pixId: row.pixId }, "Pedido pago sem imagem");
    }

    return failed ?? row;
  }
}

export async function syncOrder(ctx: OrderContext, id: string, options: SyncOptions = {}): Promise<OrderRow | null> {
  const row = await findOrder(ctx, id);

  if (!row) {
    forgetOrder(ctx, id);

    return null;
  }

  if (row.status === "paid") {
    forgetOrder(ctx, id);

    return row;
  }

  if (row.status === "paid_failed") {
    if (!options.force && isRecent(ctx, id, "recomposedAt", RECOMPOSE_INTERVAL_MS)) {
      return row;
    }

    touch(ctx, id, "recomposedAt");
    const recomposed = await confirmOrder(ctx, row);

    if (recomposed.status === "paid") {
      forgetOrder(ctx, id);
    }

    return recomposed;
  }

  if (!options.force && isRecent(ctx, id, "checkedAt", CHECK_INTERVAL_MS)) {
    return row;
  }

  touch(ctx, id, "checkedAt");
  const pixStatus = await ctx.gateway.checkPix(row.pixId);

  if (pixStatus === "PAID") {
    const confirmed = await confirmOrder(ctx, row);

    if (confirmed.status === "paid") {
      forgetOrder(ctx, id);
    }

    return confirmed;
  }

  if (row.status === "expired") {
    return row;
  }

  if (pixStatus === "EXPIRED" || pixStatus === "CANCELLED" || ctx.now() > row.expiresAt) {
    return updateOrder(ctx, row.id, { status: "expired" }, eq(orders.status, "pending"));
  }

  return row;
}

export async function refreshOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  try {
    return await syncOrder(ctx, id);
  } catch (error) {
    ctx.logger.warn({ err: error, orderRef: orderRef(id) }, "Não consegui consultar o Core; usando o estado local");

    return findOrder(ctx, id);
  }
}
