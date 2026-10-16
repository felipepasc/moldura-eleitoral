import { fileURLToPath } from "node:url";
import { createClient } from "@felipepasc/core-sdk";
import { buildApp } from "@/app";
import { createDb } from "@/core/db";
import { env } from "@/core/env";
import { logger } from "@/core/logger";
import { createMinioStorage } from "@/core/storage";
import type { OrderContext } from "@/modules/orders/context";
import { cleanupOrders } from "@/modules/orders/services/cleanup";
import { createCoreGateway } from "@/modules/payments/core";

const CLEANUP_INTERVAL_MS = 3600_000;
const CORE_TIMEOUT_MS = 10_000;

async function main() {
  const { db, sql } = createDb(env.DATABASE_URL);

  // Um cliente do Core por processo.
  const coreClient = createClient({ baseUrl: env.CORE_API_URL, apiKey: env.CORE_API_KEY, timeoutMs: CORE_TIMEOUT_MS, retries: 1 });

  // Confere a chave na subida; Core fora do ar não impede a api de subir (o Pix falha até ele voltar).
  try {
    const { service } = await coreClient.ping();
    logger.info({ coreService: service.name }, "Conectado ao Core");
  } catch (error) {
    logger.warn({ err: error instanceof Error ? { message: error.message } : undefined }, "Não consegui conferir a chave do Core");
  }

  const storage = createMinioStorage();

  await storage.ensureBucket();

  const ctx: OrderContext = {
    db,
    storage,
    gateway: createCoreGateway({ client: coreClient }),
    framesDir: fileURLToPath(new URL("../assets/frames", import.meta.url)),
    logger,
    now: () => new Date(),
  };

  const app = await buildApp({
    ctx,
    coreWebhookSecret: env.CORE_WEBHOOK_SECRET,
    webOrigin: env.WEB_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    salesEnabled: env.SALES_ENABLED,
    salesBlackout: env.SALES_BLACKOUT,
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
