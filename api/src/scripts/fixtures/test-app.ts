import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import type { DestinationStream } from "pino";
import { buildApp } from "@/app";
import type { Blackout } from "@/core/blackout";
import { createDb } from "@/core/db";
import { createLogger } from "@/core/logger";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";
import { createFakeGateway } from "@/scripts/fixtures/fake-gateway";
import { createMemoryStorage } from "@/scripts/fixtures/memory-storage";

export const CORE_WEBHOOK_SECRET = `whsec_${randomBytes(24).toString("base64")}`;

// Cabeçalhos de um aviso do Core (Standard Webhooks: HMAC-SHA256 de "<id>.<timestamp>.<corpo>").
export function signCore(raw: string, options: { id?: string; timestamp?: number; secret?: string } = {}): Record<string, string> {
  const id = options.id ?? `evt_${randomBytes(8).toString("hex")}`;
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from((options.secret ?? CORE_WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");

  return { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` };
}

export type TestAppOptions = {
  now?: () => Date;
  ordersPerMinute?: number;
  framesDir?: string;
  logStream?: DestinationStream;
  orderReadsPerMinute?: number;
  webhookPerMinute?: number;
  trustProxy?: number;
  salesEnabled?: boolean;
  webOrigin?: string;
  salesBlackout?: Blackout[];
};

export async function createTestApp(options: TestAppOptions = {}) {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "");
  const storage = createMemoryStorage();
  const gateway = createFakeGateway();
  let offsetMs = 0;

  const ctx: OrderContext = {
    db,
    storage,
    gateway,
    framesDir: options.framesDir ?? path.resolve("assets/frames"),
    logger: createLogger(options.logStream),
    now: options.now ?? (() => new Date(Date.now() + offsetMs)),
  };

  await db.delete(orders);
  await db.delete(webhookEvents);

  const app = await buildApp({
    ctx,
    coreWebhookSecret: CORE_WEBHOOK_SECRET,
    webOrigin: options.webOrigin ?? "http://localhost:6610",
    trustProxy: options.trustProxy ?? 0,
    salesEnabled: options.salesEnabled ?? true,
    salesBlackout: options.salesBlackout ?? [],
    ordersPerMinute: options.ordersPerMinute ?? 1000,
    orderReadsPerMinute: options.orderReadsPerMinute,
    webhookPerMinute: options.webhookPerMinute ?? 1000,
  });

  return {
    app,
    ctx,
    db,
    storage,
    gateway,
    advance(ms: number) {
      offsetMs += ms;
    },
    async close() {
      await app.close();
      await sql.end();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
