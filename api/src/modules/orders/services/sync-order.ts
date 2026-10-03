import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { composeImage } from "@/modules/orders/services/compose";

export async function findOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  const [row] = await ctx.db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return row ?? null;
}

async function updateOrder(ctx: OrderContext, id: string, values: Partial<typeof orders.$inferInsert>): Promise<OrderRow | null> {
  const [row] = await ctx.db
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, id), ne(orders.status, "paid")))
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
    ctx.logger.warn({ err: error, orderId }, "Não consegui apagar a foto original");
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
    const framePath = path.join(ctx.framesDir, `${row.candidateId}.png`);
    const image = await composeImage(photo, row.framing, framePath);
    const resultKey = `results/${row.id}.png`;

    await ctx.storage.put(resultKey, image, "image/png");

    const paid = await updateOrder(ctx, row.id, { status: "paid", resultKey, photoKey: null, paidAt: ctx.now() });
    await removeQuietly(ctx, row.id, row.photoKey);

    return paid ?? row;
  } catch (error) {
    ctx.logger.error({ err: error, orderId: row.id }, "Falha ao montar a imagem do pedido");

    const failed = await updateOrder(ctx, row.id, { status: "paid_failed" });

    return failed ?? row;
  }
}

export async function syncOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  const row = await findOrder(ctx, id);

  if (!row) {
    return null;
  }

  if (row.status === "paid" || row.status === "expired") {
    return row;
  }

  const pixStatus = await ctx.gateway.checkPix(row.pixId);

  if (pixStatus === "PAID") {
    return confirmOrder(ctx, row);
  }

  if (row.status === "paid_failed") {
    return row;
  }

  if (pixStatus === "EXPIRED" || pixStatus === "CANCELLED" || ctx.now() > row.expiresAt) {
    return updateOrder(ctx, row.id, { status: "expired" });
  }

  return row;
}

export async function refreshOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  try {
    return await syncOrder(ctx, id);
  } catch (error) {
    ctx.logger.warn({ err: error, orderId: id }, "Não consegui consultar a AbacatePay; usando o estado local");

    return findOrder(ctx, id);
  }
}
