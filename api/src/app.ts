import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { PHOTO_MAX_BYTES } from "@moldura/common";
import { isInBlackout } from "@/core/blackout";
import type { Blackout } from "@/core/blackout";
import { trustHops } from "@/core/trust-proxy";
import { badReq, notFound, serverErr, tooLarge } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { publicRouter } from "@/modules/public/public.router";
import { ordersRouter } from "@/modules/orders/routes/orders.router";
import { wooviWebhookRouter } from "@/modules/payments/woovi-webhook.router";
import { webhookRouter } from "@/modules/payments/webhook.router";

const DEFAULT_ORDER_READS_PER_MINUTE = 300;
const DEFAULT_WEBHOOK_PER_MINUTE = 120;

// WEB_ORIGIN pode ser uma lista separada por vírgula (apex e www); cada item vira a origem normalizada.
export function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => new URL(item).origin);
}

export type AppDeps = {
  ctx: OrderContext;
  webhookSecret?: string;
  wooviPublicKey?: string;
  webOrigin: string;
  trustProxy: number;
  salesEnabled: boolean;
  salesBlackout?: Blackout[];
  // Estilo "partido" (símbolo do partido) ligado? Padrão: ligado.
  partyStyleEnabled?: boolean;
  ordersPerMinute: number;
  orderReadsPerMinute?: number;
  webhookPerMinute?: number;
};

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    loggerInstance: deps.ctx.logger,
    trustProxy: trustHops(deps.trustProxy),
    bodyLimit: PHOTO_MAX_BYTES + 1024 * 1024,
  });

  // Vendas abertas = chave ligada e fora de qualquer janela de blackout (relógio injetável).
  const salesOpen = () => deps.salesEnabled && !isInBlackout(deps.salesBlackout ?? [], deps.ctx.now());

  await app.register(cors, { origin: parseOrigins(deps.webOrigin), exposedHeaders: ["Retry-After"] });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { files: 1, fields: 5, fileSize: PHOTO_MAX_BYTES } });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
  });

  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE" && req.url.startsWith("/webhooks")) {
      return reply.code(413).send({ error: "Requisição grande demais." });
    }

    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return tooLarge(reply, "A foto passa de 8 MB.");
    }

    if (error.code === "FST_FILES_LIMIT" || error.code === "FST_FIELDS_LIMIT" || error.code === "FST_PARTS_LIMIT") {
      return badReq(reply, "Dados do pedido inválidos.");
    }

    if (error.statusCode === 413) {
      return tooLarge(reply, "Requisição grande demais.");
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

  const partyStyleEnabled = deps.partyStyleEnabled ?? true;

  await app.register(publicRouter(salesOpen, partyStyleEnabled, deps.orderReadsPerMinute ?? DEFAULT_ORDER_READS_PER_MINUTE), { prefix: "/public" });
  await app.register(ordersRouter(deps.ctx, deps.ordersPerMinute, deps.orderReadsPerMinute ?? DEFAULT_ORDER_READS_PER_MINUTE, salesOpen, partyStyleEnabled), { prefix: "/orders" });
  const webhookPerMinute = deps.webhookPerMinute ?? DEFAULT_WEBHOOK_PER_MINUTE;

  if (deps.webhookSecret) {
    await app.register(webhookRouter(deps.ctx, deps.webhookSecret, webhookPerMinute), { prefix: "/webhooks" });
  }

  if (deps.wooviPublicKey) {
    await app.register(wooviWebhookRouter(deps.ctx, deps.wooviPublicKey, webhookPerMinute), { prefix: "/webhooks" });
  }

  return app;
}
