import { DOWNLOAD_URL_SECONDS } from "@moldura/common";
import type { Order } from "@moldura/common";
import type { OrderContext } from "@/modules/orders/context";
import type { OrderRow } from "@/modules/orders/schema";

export async function toOrderView(ctx: OrderContext, row: OrderRow): Promise<Order> {
  const pix =
    row.status === "pending"
      ? { brCode: row.pixBrCode, brCodeBase64: row.pixBrCodeBase64, expiresAt: row.expiresAt.toISOString() }
      : null;

  const downloadUrl =
    row.status === "paid" && row.resultKey ? await ctx.storage.signedUrl(row.resultKey, DOWNLOAD_URL_SECONDS) : null;

  return { id: row.id, status: row.status, candidateId: row.candidateId, pix, downloadUrl };
}
