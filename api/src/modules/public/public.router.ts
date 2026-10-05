import type { FastifyPluginAsync } from "fastify";
import { ok } from "@/core/http-fastify";

export function publicRouter(salesEnabled: boolean, readsPerMinute: number): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onSend", async (_req, reply) => {
      reply.header("Cache-Control", "no-store");
    });

    app.get("/status", { config: { rateLimit: { max: readsPerMinute, timeWindow: "1 minute" } } }, async (_req, reply) => ok(reply, { salesEnabled }));
  };
}
