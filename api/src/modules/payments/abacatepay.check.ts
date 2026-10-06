import { test } from "node:test";
import assert from "node:assert/strict";
import { createAbacatePayGateway } from "@/modules/payments/abacatepay";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(responses: Array<{ status: number; json: unknown }>) {
  const calls: Call[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const response = responses.shift();

    if (!response) {
      throw new Error("sem resposta simulada");
    }

    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    return new Response(JSON.stringify(response.json), { status: response.status });
  };

  return { fetchFn, calls };
}

test("createPix envia o corpo certo e entende a resposta embrulhada em data", async () => {
  const { fetchFn, calls } = fakeFetch([
    { status: 200, json: { data: { id: "pix_1", brCode: "000201", brCodeBase64: "QUJD", expiresAt: "2026-10-03T12:30:00.000Z" }, error: null } },
  ]);
  const gateway = createAbacatePayGateway({ apiKey: "k-123", baseUrl: "https://api.example.com/v2", fetchFn });

  const pix = await gateway.createPix({ amountCents: 399, description: "Moldura Eleitoral", expiresInSeconds: 1800, reference: "r" });

  assert.equal(calls[0].url, "https://api.example.com/v2/transparents/create");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.authorization, "Bearer k-123");
  assert.deepEqual(calls[0].body, { method: "PIX", data: { amount: 399, description: "Moldura Eleitoral", expiresIn: 1800 } });
  assert.equal(pix.id, "pix_1");
  assert.equal(pix.brCode, "000201");
  assert.equal(pix.expiresAt.toISOString(), "2026-10-03T12:30:00.000Z");
});

test("createPix aceita resposta sem o embrulho data", async () => {
  const { fetchFn } = fakeFetch([
    { status: 200, json: { id: "pix_2", brCode: "000202", brCodeBase64: "QUJD", expiresAt: "2026-10-03T12:30:00.000Z" } },
  ]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  const pix = await gateway.createPix({ amountCents: 399, description: "d", expiresInSeconds: 60, reference: "r" });

  assert.equal(pix.id, "pix_2");
});

test("checkPix consulta pelo id e devolve o status", async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { data: { status: "PAID" } } }]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  const status = await gateway.checkPix("pix 1/2");

  assert.equal(status, "PAID");
  assert.equal(calls[0].url, "https://x/v2/transparents/check?id=pix%201%2F2");
  assert.equal(calls[0].method, "GET");
});

test("resposta de erro vira exceção sem vazar a chave", async () => {
  const { fetchFn } = fakeFetch([{ status: 401, json: { error: "unauthorized" } }]);
  const gateway = createAbacatePayGateway({ apiKey: "segredo-da-chave", baseUrl: "https://x/v2", fetchFn });

  await assert.rejects(
    gateway.checkPix("pix_1"),
    (error: Error) => error.message.includes("401") && !error.message.includes("segredo-da-chave"),
  );
});

test("erro nao vaza chave, cabecalho Authorization nem corpo da resposta", async () => {
  const { fetchFn } = fakeFetch([{ status: 500, json: { error: "corpo-sensivel-xyz" } }]);
  const gateway = createAbacatePayGateway({ apiKey: "segredo-da-chave", baseUrl: "https://x/v2", fetchFn });

  await assert.rejects(gateway.checkPix("pix_1"), (error: Error) => {
    const text = `${error.message} ${error.stack ?? ""}`;

    return (
      text.includes("500") &&
      !text.includes("segredo-da-chave") &&
      !text.toLowerCase().includes("authorization") &&
      !text.includes("Bearer") &&
      !text.includes("corpo-sensivel-xyz")
    );
  });
});

function rawFetch(status: number, text: string): typeof fetch {
  return async () => new Response(text, { status });
}

for (const [raw, expected] of [
  ["UNDER_DISPUTE", "PENDING"],
  ["APPROVED", "PENDING"],
  ["REDEEMED", "PENDING"],
  ["WHATEVER", "PENDING"],
  ["FAILED", "CANCELLED"],
  ["PAID", "PAID"],
  ["PENDING", "PENDING"],
  ["EXPIRED", "EXPIRED"],
  ["CANCELLED", "CANCELLED"],
  ["REFUNDED", "REFUNDED"],
] as const) {
  test(`checkPix mapeia ${raw} para ${expected}`, async () => {
    const { fetchFn } = fakeFetch([{ status: 200, json: { data: { status: raw } } }]);
    const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

    assert.equal(await gateway.checkPix("pix_1"), expected);
  });
}

test("checkPix com status ausente ou não-string lança mensagem fixa", async () => {
  for (const json of [{ data: { id: "a" } }, { data: { status: 42 } }]) {
    const { fetchFn } = fakeFetch([{ status: 200, json }]);
    const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

    await assert.rejects(gateway.checkPix("pix_1"), (error: Error) => error.message === "AbacatePay respondeu formato inválido em /transparents/check");
  }
});

test("timeout aborta a requisição sem vazar a chave", async () => {
  const fetchFn: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const gateway = createAbacatePayGateway({ apiKey: "segredo-da-chave", baseUrl: "https://x/v2", fetchFn, timeoutMs: 20 });

  await assert.rejects(gateway.checkPix("pix_1"), (error: Error) => {
    const text = `${error.message} ${error.stack ?? ""}`;

    return !text.includes("segredo-da-chave") && !text.toLowerCase().includes("authorization") && !text.includes("Bearer");
  });
});

test("corpo não-JSON não vaza conteúdo nem chave", async () => {
  const gateway = createAbacatePayGateway({
    apiKey: "segredo-da-chave",
    baseUrl: "https://x/v2",
    fetchFn: rawFetch(200, "<!DOCTYPE html>secret-marker"),
  });

  await assert.rejects(gateway.checkPix("pix_1"), (error: Error) => {
    const text = `${error.message} ${error.stack ?? ""}`;

    return text.includes("corpo inválido") && !text.includes("secret-marker") && !text.includes("segredo-da-chave");
  });
});

test("expiresAt inválido é rejeitado", async () => {
  const { fetchFn } = fakeFetch([
    { status: 200, json: { data: { id: "p", brCode: "b", brCodeBase64: "c", expiresAt: "lixo" } } },
  ]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  await assert.rejects(gateway.createPix({ amountCents: 1, description: "d", expiresInSeconds: 1, reference: "r" }));
});

test("barra final do baseUrl é removida", async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { data: { status: "PAID" } } }]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2/", fetchFn });

  await gateway.checkPix("a");

  assert.equal(calls[0].url, "https://x/v2/transparents/check?id=a");
});

test("resposta de criação malformada lança mensagem fixa sem ecoar valores", async () => {
  const { fetchFn } = fakeFetch([{ status: 200, json: { data: { id: 123, brCode: "valor-sensivel-abc" } } }]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  await assert.rejects(gateway.createPix({ amountCents: 1, description: "d", expiresInSeconds: 1, reference: "r" }), (error: Error) => {
    const text = `${error.message} ${error.stack ?? ""}`;

    return error.message === "AbacatePay respondeu formato inválido em /transparents/create" && !text.includes("valor-sensivel-abc");
  });
});
