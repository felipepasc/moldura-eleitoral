import type { FastifyPluginAsync } from "fastify";
import type { OrderContext } from "@/modules/orders/context";

export function webhookRouter(_ctx: OrderContext, _secret: string): FastifyPluginAsync {
  return async () => {};
}
