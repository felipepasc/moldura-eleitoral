import { fileURLToPath } from "node:url";
import { buildApp } from "@/app";
import { createDb } from "@/core/db";
import { env } from "@/core/env";
import { logger } from "@/core/logger";
import { createMinioStorage } from "@/core/storage";
import type { OrderContext } from "@/modules/orders/context";
import { cleanupOrders } from "@/modules/orders/services/cleanup";
import { createAbacatePayGateway } from "@/modules/payments/abacatepay";
import type { PixGateway } from "@/modules/payments/gateway";
import { WOOVI_PUBLIC_KEY_PEM, normalizePublicKey } from "@/modules/payments/woovi-webhook.router";
import { createWooviGateway } from "@/modules/payments/woovi";

const CLEANUP_INTERVAL_MS = 3600_000;

function createGateway(): PixGateway {
  if (env.PIX_GATEWAY === "abacatepay") {
    return createAbacatePayGateway({ apiKey: env.ABACATEPAY_API_KEY ?? "", baseUrl: env.ABACATEPAY_BASE_URL });
  }

  return createWooviGateway({ appId: env.WOOVI_APP_ID ?? "", baseUrl: env.WOOVI_BASE_URL });
}

async function main() {
  const { db, sql } = createDb(env.DATABASE_URL);
  const storage = createMinioStorage();

  await storage.ensureBucket();

  const ctx: OrderContext = {
    db,
    storage,
    gateway: createGateway(),
    framesDir: fileURLToPath(new URL("../assets/frames", import.meta.url)),
    logger,
    now: () => new Date(),
  };

  const app = await buildApp({
    ctx,
    webhookSecret: env.PIX_GATEWAY === "abacatepay" ? env.ABACATEPAY_WEBHOOK_SECRET : undefined,
    wooviPublicKey: env.PIX_GATEWAY === "woovi" ? normalizePublicKey(env.WOOVI_WEBHOOK_PUBLIC_KEY ?? WOOVI_PUBLIC_KEY_PEM) : undefined,
    webOrigin: env.WEB_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    salesEnabled: env.SALES_ENABLED,
    salesBlackout: env.SALES_BLACKOUT,
    partyStyleEnabled: env.PARTY_STYLE_ENABLED,
    ordersPerMinute: 10,
  });

  let cleaning = false;

  async function runCleanup() {
    if (cleaning) {
      return;
    }

    cleaning = true;

    try {
      const result = await cleanupOrders(ctx);
      logger.info(result, "Limpeza concluída");
    } catch (error) {
      logger.error({ err: error }, "Falha na limpeza");
    } finally {
      cleaning = false;
    }
  }

  const timer = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    let exitCode = 0;

    try {
      clearInterval(timer);
      await app.close();
      await sql.end();
    } catch (error) {
      exitCode = 1;
      logger.error({ err: error }, "Falha ao encerrar");
    } finally {
      process.exit(exitCode);
    }
  }

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  void runCleanup();
}

main().catch((error) => {
  logger.error({ err: error }, "Falha ao iniciar");
  process.exit(1);
});
