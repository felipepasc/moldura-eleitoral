import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { orders } from "@/modules/orders/schema";
import { parseBlackout } from "@/core/blackout";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;

afterEach(async () => {
  await t.close();
});

async function postOrder(app: TestApp["app"], headers: Record<string, string> = {}, url = "/orders") {
  const form = new FormData();
  form.append("candidateId", "lula");
  form.append("framing", JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 }));
  form.append("consent", "true");
  form.append("photo", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "foto.jpg");
  const request = new Request("http://localhost", { method: "POST", body: form });

  return app.inject({
    method: "POST",
    url,
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "", ...headers },
  });
}

beforeEach(async () => {
  t = await createTestApp({ salesEnabled: false });
});

test("com as vendas fechadas POST /orders devolve 503 e não grava nada", async () => {
  const res = await postOrder(t.app);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { error: "As vendas estão fechadas no momento." });
  assert.equal(t.storage.files.size, 0);
  assert.equal(t.gateway.created.length, 0);
  assert.equal((await t.db.select().from(orders)).length, 0);
});

test("GET /public/status devolve só salesEnabled, no-store e CORS", async () => {
  const res = await t.app.inject({ method: "GET", url: "/public/status", headers: { origin: "http://localhost:6610" } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { salesEnabled: false });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["access-control-allow-origin"], "http://localhost:6610");
});

test("GET /public/status respeita o limite de leituras", async () => {
  await t.close();
  t = await createTestApp({ salesEnabled: true, orderReadsPerMinute: 2 });

  assert.deepEqual((await t.app.inject({ method: "GET", url: "/public/status" })).json(), { salesEnabled: true });
  assert.equal((await t.app.inject({ method: "GET", url: "/public/status" })).statusCode, 200);
  assert.equal((await t.app.inject({ method: "GET", url: "/public/status" })).statusCode, 429);
});

test("com as vendas abertas (padrão dos testes) o POST /orders segue o fluxo normal", async () => {
  await t.close();
  t = await createTestApp();

  const res = await postOrder(t.app);

  assert.notEqual(res.statusCode, 503);
});

test("com as vendas fechadas nenhuma grafia da rota de criação passa", async () => {
  for (const url of ["/orders", "/orders/", "/orders?a=1", "/orders/?a=1", "/%6Frders", "/%6Frders/"]) {
    const res = await postOrder(t.app, {}, url);

    assert.equal(res.statusCode, 503, url);
  }

  assert.equal(t.storage.files.size, 0);
  assert.equal(t.gateway.created.length, 0);
  assert.equal((await t.db.select().from(orders)).length, 0);
});

test("com as vendas fechadas o GET do pedido e o download continuam funcionando", async () => {
  await t.close();
  t = await createTestApp();
  const created = await postOrder(t.app);
  const id = created.json().id as string;

  await t.close();
  t = await createTestApp({ salesEnabled: false });

  assert.equal((await t.app.inject({ method: "GET", url: `/orders/${id}` })).statusCode, 404);
  assert.equal((await t.app.inject({ method: "GET", url: "/orders/6b1f9a52-5a43-4d52-8d52-0a8f2f0a0000" })).statusCode, 404);
  assert.equal((await t.app.inject({ method: "POST", url: "/webhooks/core", payload: { id: "evt_x", type: "charge.paid" } })).statusCode, 400);
});

test("SALES_ENABLED sem valor fecha as vendas (fail-closed)", async () => {
  const { parseEnv } = await import("@/core/env");
  const base = { DATABASE_URL: "x", MINIO_ACCESS_KEY: "a", MINIO_SECRET_KEY: "b", CORE_API_KEY: "fk_abc", CORE_WEBHOOK_SECRET: "whsec_x" };

  assert.equal(parseEnv(base).SALES_ENABLED, false);
  assert.equal(parseEnv({ ...base, SALES_ENABLED: "true" }).SALES_ENABLED, true);
  assert.equal(parseEnv({ ...base, SALES_ENABLED: "false" }).SALES_ENABLED, false);
});

const WINDOW = parseBlackout("2026-10-25T00:00:00-03:00/2026-10-26T17:00:00-03:00");

async function appAt(iso: string, salesEnabled = true) {
  await t.close();
  const clock = new Date(iso);
  t = await createTestApp({ salesEnabled, salesBlackout: WINDOW, now: () => clock });
}

test("dentro da janela de blackout POST /orders devolve 503 e /public/status fecha", async () => {
  await appAt("2026-10-25T12:00:00-03:00");

  const res = await postOrder(t.app);
  const status = await t.app.inject({ method: "GET", url: "/public/status" });

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { error: "As vendas estão fechadas no momento." });
  assert.deepEqual(status.json(), { salesEnabled: false });
  assert.equal(t.gateway.created.length, 0);
});

test("antes e depois da janela as vendas seguem abertas; as bordas valem início inclusivo e fim exclusivo", async () => {
  for (const [iso, open] of [
    ["2026-10-24T23:59:59-03:00", true],
    ["2026-10-25T00:00:00-03:00", false],
    ["2026-10-26T16:59:59-03:00", false],
    ["2026-10-26T17:00:00-03:00", true],
  ] as const) {
    await appAt(iso);

    const status = await t.app.inject({ method: "GET", url: "/public/status" });
    const res = await postOrder(t.app);

    assert.deepEqual(status.json(), { salesEnabled: open }, iso);
    assert.equal(res.statusCode === 503, !open, iso);
  }
});

test("SALES_ENABLED=false fecha mesmo fora da janela", async () => {
  await appAt("2026-11-10T12:00:00-03:00", false);

  assert.deepEqual((await t.app.inject({ method: "GET", url: "/public/status" })).json(), { salesEnabled: false });
});

test("durante o blackout webhook, GET do pedido e liberação continuam funcionando", async () => {
  await appAt("2026-10-25T12:00:00-03:00");

  assert.equal((await t.app.inject({ method: "GET", url: "/orders/6b1f9a52-5a43-4d52-8d52-0a8f2f0a0000" })).statusCode, 404);
  assert.equal((await t.app.inject({ method: "POST", url: "/webhooks/core", payload: { id: "evt_x", type: "charge.paid" } })).statusCode, 400);
});
