import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateOrderSchema, PHOTO_MIME_TYPES } from "@moldura/common";
import { badGateway, badReq, created, notFound, ok } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { GatewayError, createOrder } from "@/modules/orders/services/create-order";
import { toOrderView } from "@/modules/orders/services/order-view";
import { InvalidPhotoError } from "@/modules/orders/services/photo";
import { refreshOrder } from "@/modules/orders/services/sync-order";

const ParamsSchema = z.object({ id: z.uuid() });

function fieldValue(field: unknown): string | undefined {
  if (field && typeof field === "object" && "type" in field && field.type === "field" && "value" in field) {
    return typeof field.value === "string" ? field.value : undefined;
  }

  return undefined;
}

function parseJson(text: string | undefined): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function ordersRouter(ctx: OrderContext, ordersPerMinute: number, readsPerMinute: number): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onSend", async (_req, reply) => {
      reply.header("Cache-Control", "no-store");
    });

    app.post("/", { config: { rateLimit: { max: ordersPerMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
      const file = await req.file();

      if (!file) {
        return badReq(reply, "Envie uma foto.");
      }

      if (!PHOTO_MIME_TYPES.includes(file.mimetype)) {
        return badReq(reply, "A foto precisa ser JPG, PNG ou WebP.");
      }

      const parsed = CreateOrderSchema.safeParse({
        candidateId: fieldValue(file.fields.candidateId),
        framing: parseJson(fieldValue(file.fields.framing)),
      });

      if (!parsed.success) {
        return badReq(reply, "Dados do pedido inválidos.");
      }

      const photo = await file.toBuffer();

      try {
        const row = await createOrder(ctx, { ...parsed.data, photo, ipAddress: req.ip });
        const view = await toOrderView(ctx, row);

        return created(reply, view);
      } catch (error) {
        if (error instanceof InvalidPhotoError) {
          return badReq(reply, error.message);
        }

        if (error instanceof GatewayError) {
          return badGateway(reply, error.message);
        }

        throw error;
      }
    });

    app.get("/:id", { config: { rateLimit: { max: readsPerMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
      const params = ParamsSchema.safeParse(req.params);

      if (!params.success) {
        return notFound(reply, "Pedido não encontrado.");
      }

      const row = await refreshOrder(ctx, params.data.id);

      if (!row) {
        return notFound(reply, "Pedido não encontrado.");
      }

      const view = await toOrderView(ctx, row);

      return ok(reply, view);
    });
  };
}
