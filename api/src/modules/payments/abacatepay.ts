import { z } from "zod";
import type { CreatedPix, PixGateway, PixStatus } from "@/modules/payments/gateway";

const CreatedPixSchema = z.object({
  id: z.string(),
  brCode: z.string(),
  brCodeBase64: z.string(),
  expiresAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime())),
});

const CheckPixSchema = z.object({
  status: z.string(),
});

const DIRECT_STATUSES: readonly PixStatus[] = ["PENDING", "PAID", "EXPIRED", "CANCELLED", "REFUNDED"];

const DEFAULT_TIMEOUT_MS = 10_000;

export type AbacatePayOptions = {
  apiKey: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

function unwrap(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in json && json.data) {
    return json.data;
  }

  return json;
}

function mapStatus(raw: string): PixStatus {
  const direct = DIRECT_STATUSES.find((status) => status === raw);

  if (direct) {
    return direct;
  }

  if (raw === "FAILED") {
    return "CANCELLED";
  }

  return "PENDING";
}

export function createAbacatePayGateway(options: AbacatePayOptions): PixGateway {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const route = path.split("?")[0];
    let response: Response;

    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new Error(`AbacatePay não respondeu em ${route}`);
    }

    if (!response.ok) {
      throw new Error(`AbacatePay respondeu ${response.status} em ${route}`);
    }

    let json: unknown;

    try {
      json = await response.json();
    } catch {
      throw new Error(`AbacatePay respondeu corpo inválido em ${route}`);
    }

    return unwrap(json);
  }

  function parse<T>(schema: z.ZodType<T>, data: unknown, path: string): T {
    const result = schema.safeParse(data);

    if (!result.success) {
      throw new Error(`AbacatePay respondeu formato inválido em ${path}`);
    }

    return result.data;
  }

  return {
    async createPix(input): Promise<CreatedPix> {
      const data = await request("/transparents/create", {
        method: "POST",
        body: JSON.stringify({
          method: "PIX",
          data: { amount: input.amountCents, description: input.description, expiresIn: input.expiresInSeconds },
        }),
      });
      const parsed = parse(CreatedPixSchema, data, "/transparents/create");

      return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
    },

    async checkPix(id): Promise<PixStatus> {
      const data = await request(`/transparents/check?id=${encodeURIComponent(id)}`, { method: "GET" });

      return mapStatus(parse(CheckPixSchema, data, "/transparents/check").status);
    },
  };
}
