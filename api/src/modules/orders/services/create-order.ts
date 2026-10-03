import { randomUUID } from "node:crypto";
import { PIX_EXPIRES_SECONDS, PRICE_CENTS } from "@moldura/common";
import type { Framing } from "@moldura/common";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { normalizePhoto } from "@/modules/orders/services/photo";
import type { CreatedPix } from "@/modules/payments/gateway";

export class GatewayError extends Error {}

export type CreateOrderInput = {
  candidateId: string;
  framing: Framing;
  photo: Buffer;
  ipAddress: string;
};

export async function createOrder(ctx: OrderContext, input: CreateOrderInput): Promise<OrderRow> {
  const photo = await normalizePhoto(input.photo);
  const id = randomUUID();
  const photoKey = `photos/${id}.jpg`;

  await ctx.storage.put(photoKey, photo, "image/jpeg");

  let pix: CreatedPix;

  try {
    pix = await ctx.gateway.createPix({
      amountCents: PRICE_CENTS,
      description: "Moldura Eleitoral",
      expiresInSeconds: PIX_EXPIRES_SECONDS,
    });
  } catch (error) {
    ctx.logger.error({ err: error }, "Falha ao criar o Pix");
    await ctx.storage.remove(photoKey);
    throw new GatewayError("Não foi possível gerar o Pix agora. Tente de novo em instantes.");
  }

  const [row] = await ctx.db
    .insert(orders)
    .values({
      id,
      candidateId: input.candidateId,
      photoKey,
      framing: input.framing,
      pixId: pix.id,
      pixBrCode: pix.brCode,
      pixBrCodeBase64: pix.brCodeBase64,
      ipAddress: input.ipAddress,
      expiresAt: pix.expiresAt,
    })
    .returning();

  if (!row) {
    throw new Error("Falha ao gravar o pedido.");
  }

  return row;
}
