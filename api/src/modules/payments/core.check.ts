import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@felipepasc/core-sdk";
import sharp from "sharp";
import { brasiliaDay, createCoreGateway } from "@/modules/payments/core";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Reply = { status: number; json?: unknown } | "throw";

const API_KEY = "fk_chave-secreta-de-teste";
const BR_CODE = "00020101021226580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913Moldura6009SAO PAULO62070503***6304ABCD";
const REFERENCE = "9f1c2b3a4d5e6f708192a3b4c5d6e7f8";
const NOW = new Date("2026-10-16T02:30:00.000Z");

function fakeCore(replies: Reply[]) {
  const calls: Call[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const reply = replies.shift();

    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    if (!reply || reply === "throw") {
      throw new Error(`conexão recusada com ${API_KEY}`);
    }

    return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status });
  };

  const client = createClient({ baseUrl: "https://core.test/", apiKey: API_KEY, fetch: fetchFn, retries: 0 });

  return { gateway: createCoreGateway({ client, now: () => NOW }), calls };
}

function charge(status: string) {
  return { externalId: REFERENCE, kind: "charge", status, totalCents: 399 };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    provider: "asaas",
    method: "pix",
    status: "pending",
    amountCents: 399,
    paymentUrl: "https://provedor.example/pay/abc",
    pixCopyPaste: BR_CODE,
    pixQrCodeImage: "https://terceiro.example/qr.png",
    boletoUrl: null,
    boletoLine: null,
    expiresAt: "2026-10-16T03:30:00.000Z",
    paidAt: null,
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

const INPUT = { amountCents: 399, description: "Moldura Eleitoral", expiresInSeconds: 3600, reference: REFERENCE };

test("dia de Brasília: 23h30 de Brasília ainda é o mesmo dia mesmo já sendo amanhã em UTC", () => {
  assert.equal(brasiliaDay(new Date("2026-10-16T02:30:00.000Z")), "2026-10-15");
  assert.equal(brasiliaDay(new Date("2026-10-16T03:00:00.000Z")), "2026-10-16");
});

test("createPix cria a cobrança pela referência, pede o Pix e gera o QR localmente", async () => {
  const { gateway, calls } = fakeCore([{ status: 201, json: charge("open") }, { status: 201, json: payment() }]);

  const pix = await gateway.createPix(INPUT);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].url, `https://core.test/v1/charges/${REFERENCE}`);
  assert.equal(calls[0].headers.authorization, `Bearer ${API_KEY}`);
  assert.deepEqual(calls[0].body, {
    customer: { name: "Cliente Moldura Eleitoral" },
    items: [{ description: "Moldura Eleitoral", unitPriceCents: 399 }],
    dueDate: "2026-10-15",
  });
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].url, `https://core.test/v1/charges/${REFERENCE}/payments`);
  assert.deepEqual(calls[1].body, { method: "pix" });

  assert.equal(pix.id, REFERENCE);
  assert.equal(pix.brCode, BR_CODE);
  assert.equal(pix.expiresAt.toISOString(), "2026-10-16T03:30:00.000Z");
  // O QR é nosso (PNG em base64), nunca a imagem hospedada pelo provedor.
  assert.ok(!pix.brCodeBase64.startsWith("data:"));
  const meta = await sharp(Buffer.from(pix.brCodeBase64, "base64")).metadata();
  assert.equal(meta.format, "png");
});

test("sem validade do provedor, o Pix vale o prazo pedido", async () => {
  const { gateway } = fakeCore([{ status: 200, json: charge("open") }, { status: 200, json: payment({ expiresAt: null }) }]);

  const pix = await gateway.createPix(INPUT);

  assert.equal(pix.expiresAt.getTime(), NOW.getTime() + 3600_000);
});

test("Pix sem copia e cola ou com outro valor é recusado", async () => {
  for (const overrides of [{ pixCopyPaste: null }, { amountCents: 1 }, { expiresAt: "lixo" }]) {
    const { gateway } = fakeCore([{ status: 200, json: charge("open") }, { status: 200, json: payment(overrides) }]);

    await assert.rejects(gateway.createPix(INPUT), /formato inválido/);
  }
});

test("erros do Core viram mensagem com status e código, sem a chave nem a mensagem do Core", async () => {
  const cases: Array<{ replies: Reply[]; pattern: RegExp }> = [
    { replies: [{ status: 409, json: { error: { code: "no_payment_account", message: "Cliente Moldura sem conta" } } }], pattern: /^Core respondeu 409 \(no_payment_account\) em \/charges\/:id$/ },
    { replies: [{ status: 200, json: charge("open") }, { status: 401, json: { error: { code: "invalid_api_key", message: "x" } } }], pattern: /^Core respondeu 401 \(invalid_api_key\) em \/charges\/:id\/payments$/ },
    { replies: ["throw"], pattern: /^Core não respondeu em \/charges\/:id$/ },
  ];

  for (const { replies, pattern } of cases) {
    const { gateway } = fakeCore(replies);

    await assert.rejects(gateway.createPix(INPUT), (error: Error) => {
      assert.match(error.message, pattern);
      assert.ok(!error.message.includes(API_KEY));
      return true;
    });
  }
});

test("checkPix: só a cobrança paga libera; cancelada vira CANCELLED; o resto é pendente", async () => {
  const expected: Record<string, string> = { paid: "PAID", canceled: "CANCELLED", open: "PENDING", outro: "PENDING", PAID: "PENDING" };

  for (const [status, mapped] of Object.entries(expected)) {
    const { gateway, calls } = fakeCore([{ status: 200, json: charge(status) }]);

    assert.equal(await gateway.checkPix(REFERENCE), mapped, status);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, `https://core.test/v1/charges/${REFERENCE}`);
  }
});

test("checkPix com o Core fora do ar lança (o pedido segue pendente)", async () => {
  const { gateway } = fakeCore([{ status: 404, json: { error: { code: "charge_not_found", message: "x" } } }]);

  await assert.rejects(gateway.checkPix(REFERENCE), /404 \(charge_not_found\)/);
});
