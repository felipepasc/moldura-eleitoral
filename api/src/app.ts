import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { PHOTO_MAX_BYTES } from "@moldura/common";
import { notFound, serverErr, tooLarge } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { ordersRouter } from "@/modules/orders/routes/orders.router";
import { webhookRouter } from "@/modules/payments/webhook.router";

const DEFAULT_ORDER_READS_PER_MINUTE = 60;
const DEFAULT_WEBHOOK_PER_MINUTE = 120;

export type AppDeps = {
  ctx: OrderContext;
  webhookSecret: string;
  webOrigin: string;
  trustProxy: boolean;
  ordersPerMinute: number;
  orderReadsPerMinute?: number;
  webhookPerMinute?: number;
};

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    loggerInstance: deps.ctx.logger,
    trustProxy: deps.trustProxy,
    bodyLimit: PHOTO_MAX_BYTES + 1024 * 1024,
  });

  await app.register(cors, { origin: deps.webOrigin });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { files: 1, fields: 5, fileSize: PHOTO_MAX_BYTES } });

  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE" && req.url.startsWith("/webhooks")) {
      return reply.code(413).send({ error: "Requisição grande demais." });
    }

    if (error.code === "FST_REQ_FILE_TOO_LARGE" || error.statusCode === 413) {
      return tooLarge(reply, "A foto passa de 8 MB.");
    }

    if (error.statusCode === 429) {
      return reply.code(429).send({ error: "Muitas tentativas. Aguarde um instante e tente de novo." });
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: "Requisição inválida." });
    }

    req.log.error({ err: error }, "Erro não tratado");

    return serverErr(reply);
  });

  app.setNotFoundHandler((_req, reply) => notFound(reply, "Não encontrado."));

  app.get("/healthz", async () => ({ ok: true }));

  await app.register(ordersRouter(deps.ctx, deps.ordersPerMinute, deps.orderReadsPerMinute ?? DEFAULT_ORDER_READS_PER_MINUTE), { prefix: "/orders" });
  await app.register(webhookRouter(deps.ctx, deps.webhookSecret, deps.webhookPerMinute ?? DEFAULT_WEBHOOK_PER_MINUTE), { prefix: "/webhooks" });

  return app;
}
