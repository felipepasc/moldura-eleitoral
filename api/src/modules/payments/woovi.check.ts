import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createWooviGateway } from "@/modules/payments/woovi";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(responses: Array<{ status: number; json?: unknown; raw?: string } | "throw">) {
  const calls: Call[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const response = responses.shift();

    if (!response || response === "throw") {
      throw new Error("conexão recusada com segredo-do-app");
    }

    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    return new Response(response.raw ?? JSON.stringify(response.json), { status: response.status });
  };

  return { fetchFn, calls };
}

const BR_CODE = "00020101021226580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913Moldura6009SAO PAULO62070503***6304ABCD";
const ORDER_ID = "3f2a2690-8224-4aae-a1ba-ed26d4d61f81";

function chargeResponse(overrides: Record<string, unknown> = {}) {
  return {
    charge: {
      correlationID: ORDER_ID,
      status: "ACTIVE",
      value: 399,
      brCode: BR_CODE,
      expiresDate: "2026-10-05T15:30:00.000Z",
      qrCodeImage: "https://api.woovi.com/openpix/charge/brcode/image/x.png",
      ...overrides,
    },
    correlationID: ORDER_ID,
    brCode: BR_CODE,
  };
}

const INPUT = { amountCents: 399, description: "Moldura Eleitoral", expiresInSeconds: 1800, reference: ORDER_ID };

test("createPix chama o endpoint certo com AppID cru e corpo certo", async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: chargeResponse() }]);
  const gateway = createWooviGateway({ appId: "app-123", baseUrl: "https://api.woovi.test/", fetchFn });

  const pix = await gateway.createPix(INPUT);

  assert.equal(calls[0].url, "https://api.woovi.test/api/v1/charge?return_existing=true");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.authorization, "app-123");
  assert.equal(calls[0].headers["content-type"], "application/json");
  assert.deepEqual(calls[0].body, { correlationID: ORDER_ID, value: 399, comment: "Moldura Eleitoral", expiresIn: 1800 });
  assert.equal(pix.id, ORDER_ID);
  assert.equal(pix.brCode, BR_CODE);
  assert.equal(pix.expiresAt.toISOString(), "2026-10-05T15:30:00.000Z");
});

test("createPix respeita o mínimo de 300 s de expiração", async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: chargeResponse() }]);

  await createWooviGateway({ appId: "a", baseUrl: "https://x", fetchFn }).createPix({ ...INPUT, expiresInSeconds: 60 });

  assert.equal((calls[0].body as { expiresIn: number }).expiresIn, 300);
});

test("o QR code é gerado localmente como PNG de ~320 px, sem usar a URL da Woovi", async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: chargeResponse() }]);

  const pix = await createWooviGateway({ appId: "a", baseUrl: "https://x", fetchFn }).createPix(INPUT);
  const png = Buffer.from(pix.brCodeBase64, "base64");
  const meta = await sharp(png).metadata();

  assert.equal(calls.length, 1);
  assert.equal(meta.format, "png");
  assert.ok(Math.abs((meta.width ?? 0) - 320) <= 40);
  assert.ok(!pix.brCodeBase64.startsWith("data:"));
  assert.ok(!pix.brCodeBase64.includes("woovi"));
});

test("createPix lê brCode do topo quando o charge não o traz", async () => {
  const response = chargeResponse();
  delete (response.charge as Record<string, unknown>).brCode;
  const { fetchFn } = fakeFetch([{ status: 200, json: response }]);

  const pix = await createWooviGateway({ appId: "a", baseUrl: "https://x", fetchFn }).createPix(INPUT);

  assert.equal(pix.brCode, BR_CODE);
});

test("checkPix consulta pelo id codificado e mapeia os status", async () => {
  const map: Array<[string, string]> = [["ACTIVE", "PENDING"], ["COMPLETED", "PAID"], ["EXPIRED", "EXPIRED"], ["REFUNDED", "PENDING"], ["ALGO_NOVO", "PENDING"]];

  for (const [raw, expected] of map) {
    const { fetchFn, calls } = fakeFetch([{ status: 200, json: { charge: { status: raw, correlationID: "a/b" } } }]);

    const status = await createWooviGateway({ appId: "app-123", baseUrl: "https://api.woovi.test", fetchFn }).checkPix("a/b");

    assert.equal(status, expected, raw);
    assert.equal(calls[0].url, "https://api.woovi.test/api/v1/charge/a%2Fb");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.authorization, "app-123");
  }
});

test("erros têm mensagem fixa, sem corpo nem AppID", async () => {
  const gateway = (responses: Parameters<typeof fakeFetch>[0]) => createWooviGateway({ appId: "segredo-do-app", baseUrl: "https://x", fetchFn: fakeFetch(responses).fetchFn });
  const failures = [
    gateway([{ status: 401, json: { error: "appID inválido segredo-do-app" } }]).createPix(INPUT),
    gateway([{ status: 500, raw: "<html>segredo-do-app</html>" }]).checkPix("x"),
    gateway(["throw"]).checkPix("x"),
    gateway([{ status: 200, raw: "não é json segredo-do-app" }]).checkPix("x"),
    gateway([{ status: 200, json: { charge: { status: 5 } } }]).checkPix("x"),
    gateway([{ status: 200, json: chargeResponse({ expiresDate: "ontem" }) }]).createPix(INPUT),
    gateway([{ status: 200, json: { charge: { correlationID: "x" } } }]).createPix(INPUT),
  ];

  for (const failure of failures) {
    await assert.rejects(failure, (error: Error) => {
      assert.ok(error.message.startsWith("Woovi "));
      assert.ok(!error.message.includes("segredo-do-app"));
      assert.ok(!error.message.includes("html"));

      return true;
    });
  }
});

test("timeout aborta a chamada", async () => {
  const fetchFn: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
    });

  await assert.rejects(createWooviGateway({ appId: "a", baseUrl: "https://x", fetchFn, timeoutMs: 30 }).checkPix("x"), /Woovi não respondeu/);
});
