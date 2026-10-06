import { generateKeyPairSync, sign } from "node:crypto";
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

export const WEBHOOK_SECRET = "test-webhook-secret-123456";

const WOOVI_KEYS = generateKeyPairSync("rsa", { modulusLength: 2048 });
const OTHER_KEYS = generateKeyPairSync("rsa", { modulusLength: 2048 });

export const WOOVI_TEST_PUBLIC_KEY = WOOVI_KEYS.publicKey.export({ type: "spki", format: "pem" }).toString();

// Assina o corpo cru como a Woovi faz (RSA + SHA-256, base64). Com `forged`, assina com outra chave.
export function signWoovi(raw: string | Buffer, forged = false): string {
  return sign("sha256", Buffer.from(raw), (forged ? OTHER_KEYS : WOOVI_KEYS).privateKey).toString("base64");
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
    webhookSecret: WEBHOOK_SECRET,
    wooviPublicKey: WOOVI_TEST_PUBLIC_KEY,
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
