import { z } from "zod";
import { findCandidate } from "./candidates";
import { MAX_ZOOM } from "./framing";

export const PRICE_CENTS = 399;
export const PIX_EXPIRES_SECONDS = 1800;
export const DOWNLOAD_URL_SECONDS = 300;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_MIME_TYPES: string[] = ["image/jpeg", "image/png", "image/webp"];
export const ORDER_STATUSES = ["pending", "paid", "paid_failed", "expired"] as const;

export const FramingSchema = z.object({
  zoom: z.number().min(1).max(MAX_ZOOM),
  offsetX: z.number().min(-1).max(1),
  offsetY: z.number().min(-1).max(1),
});
export type Framing = z.infer<typeof FramingSchema>;

export const CreateOrderSchema = z.object({
  candidateId: z.string().refine((id) => findCandidate(id) !== undefined, "Candidato inválido"),
  framing: FramingSchema,
  // Consentimento para tratar a foto e a moldura (dado sensível: revela preferência política).
  consent: z.literal("true"),
});
export const CONSENT_REQUIRED_MESSAGE = "Confirme o consentimento para continuar.";
export type CreateOrderBody = z.infer<typeof CreateOrderSchema>;

export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: z.uuid(),
  status: OrderStatusSchema,
  candidateId: z.string(),
  pix: z
    .object({
      brCode: z.string(),
      brCodeBase64: z.string(),
      expiresAt: z.string(),
    })
    .nullable(),
  // Só http/https: o link vira href no navegador.
  downloadUrl: z.url({ protocol: /^https?$/ }).nullable(),
});
export type Order = z.infer<typeof OrderSchema>;
