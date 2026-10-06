import QRCode from "qrcode";
import { z } from "zod";
import type { CreatedPix, PixGateway, PixStatus } from "@/modules/payments/gateway";

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_EXPIRES_IN_SECONDS = 300;
const QR_WIDTH = 320;

const ChargeSchema = z.object({
  correlationID: z.string().min(1),
  status: z.string().optional(),
  brCode: z.string().min(1).optional(),
  expiresDate: z.string().optional(),
});

const CreateResponseSchema = z.object({
  charge: ChargeSchema,
  brCode: z.string().min(1).optional(),
});

const CheckResponseSchema = z.object({
  charge: z.object({ status: z.string() }),
});

export type WooviOptions = {
  appId: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

// Nunca infere PAID: só o literal COMPLETED libera.
function mapStatus(raw: string): PixStatus {
  if (raw === "COMPLETED") {
    return "PAID";
  }

  if (raw === "EXPIRED") {
    return "EXPIRED";
  }

  return "PENDING";
}

export function createWooviGateway(options: WooviOptions): PixGateway {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const route = path.split("?")[0]?.replace(/\/charge\/.+$/, "/charge/:id");
    let response: Response;

    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: options.appId,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new Error(`Woovi não respondeu em ${route}`);
    }

    if (!response.ok) {
      throw new Error(`Woovi respondeu ${response.status} em ${route}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error(`Woovi respondeu corpo inválido em ${route}`);
    }
  }

  function parse<T>(schema: z.ZodType<T>, data: unknown, route: string): T {
    const result = schema.safeParse(data);

    if (!result.success) {
      throw new Error(`Woovi respondeu formato inválido em ${route}`);
    }

    return result.data;
  }

  return {
    async createPix(input): Promise<CreatedPix> {
      const json = await request("/api/v1/charge?return_existing=true", {
        method: "POST",
        body: JSON.stringify({
          correlationID: input.reference,
          value: input.amountCents,
          comment: input.description,
          expiresIn: Math.max(input.expiresInSeconds, MIN_EXPIRES_IN_SECONDS),
        }),
      });
      const parsed = parse(CreateResponseSchema, json, "/api/v1/charge");
      const brCode = parsed.charge.brCode ?? parsed.brCode;
      const expiresAt = new Date(parsed.charge.expiresDate ?? "");

      if (!brCode || Number.isNaN(expiresAt.getTime())) {
        throw new Error("Woovi respondeu formato inválido em /api/v1/charge");
      }

      // QR gerado aqui, sem usar a imagem hospedada pela Woovi (nenhum pedido a terceiros no navegador).
      const dataUrl = await QRCode.toDataURL(brCode, { width: QR_WIDTH, margin: 1 });

      return {
        id: parsed.charge.correlationID,
        brCode,
        brCodeBase64: dataUrl.replace(/^data:image\/png;base64,/, ""),
        expiresAt,
      };
    },

    async checkPix(id): Promise<PixStatus> {
      const json = await request(`/api/v1/charge/${encodeURIComponent(id)}`, { method: "GET" });

      return mapStatus(parse(CheckResponseSchema, json, "/api/v1/charge/:id").charge.status);
    },
  };
}
