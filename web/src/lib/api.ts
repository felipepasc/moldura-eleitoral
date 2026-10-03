import { OrderSchema } from "@moldura/common";
import type { Framing, Order } from "@moldura/common";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6600";

export const FALLBACK_MESSAGE = "Algo deu errado. Tente de novo.";

export class ApiError extends Error {}

export function messageOf(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : FALLBACK_MESSAGE;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readOrder(response: Response): Promise<Order> {
  const json = await readJson(response);

  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : FALLBACK_MESSAGE;

    throw new ApiError(message);
  }

  const parsed = OrderSchema.safeParse(json);

  if (!parsed.success) {
    throw new ApiError(FALLBACK_MESSAGE);
  }

  return parsed.data;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(FALLBACK_MESSAGE);
  }
}

export async function createOrder(input: { candidateId: string; framing: Framing; photo: File }): Promise<Order> {
  const form = new FormData();

  // A api só lê os campos de texto que vêm ANTES do arquivo.
  form.append("candidateId", input.candidateId);
  form.append("framing", JSON.stringify(input.framing));
  form.append("photo", input.photo);

  const response = await request(`${API_URL}/orders`, { method: "POST", body: form, referrerPolicy: "no-referrer" });

  return readOrder(response);
}

export async function getOrder(id: string): Promise<Order> {
  const response = await request(`${API_URL}/orders/${encodeURIComponent(id)}`, { cache: "no-store", referrerPolicy: "no-referrer" });

  return readOrder(response);
}
