import { z } from "zod";
import type { CreatedPix, PixGateway, PixStatus } from "@/modules/payments/gateway";

const CreatedPixSchema = z.object({
  id: z.string(),
  brCode: z.string(),
  brCodeBase64: z.string(),
  expiresAt: z.string(),
});

const CheckPixSchema = z.object({
  status: z.enum(["PENDING", "PAID", "EXPIRED", "CANCELLED", "REFUNDED"]),
});

export type AbacatePayOptions = {
  apiKey: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
};

function unwrap(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in json && json.data) {
    return json.data;
  }

  return json;
}

export function createAbacatePayGateway(options: AbacatePayOptions): PixGateway {
  const fetchFn = options.fetchFn ?? fetch;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetchFn(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`AbacatePay respondeu ${response.status} em ${path.split("?")[0]}`);
    }

    const json: unknown = await response.json();

    return unwrap(json);
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
      const parsed = CreatedPixSchema.parse(data);

      return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
    },

    async checkPix(id): Promise<PixStatus> {
      const data = await request(`/transparents/check?id=${encodeURIComponent(id)}`, { method: "GET" });

      return CheckPixSchema.parse(data).status;
    },
  };
}
