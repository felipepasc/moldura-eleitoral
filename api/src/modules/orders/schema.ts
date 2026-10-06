import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Framing } from "@moldura/common";

export const orderStatus = pgEnum("order_status", ["pending", "paid", "paid_failed", "expired"]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: orderStatus("status").notNull().default("pending"),
  candidateId: text("candidate_id").notNull(),
  // Estilo da moldura; NULL (pedidos antigos) vale a clássica.
  frameStyle: text("frame_style"),
  photoKey: text("photo_key"),
  framing: jsonb("framing").$type<Framing>().notNull(),
  pixId: text("pix_id").notNull().unique(),
  pixBrCode: text("pix_br_code").notNull(),
  pixBrCodeBase64: text("pix_br_code_base64").notNull(),
  resultKey: text("result_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type OrderRow = typeof orders.$inferSelect;
