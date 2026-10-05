import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { orders } from "@/modules/orders/schema";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;

afterEach(async () => {
  await t.close();
});

async function postOrder(app: TestApp["app"], headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("candidateId", "lula");
  form.append("framing", JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 }));
  form.append("photo", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "foto.jpg");
  const request = new Request("http://localhost", { method: "POST", body: form });

  return app.inject({
    method: "POST",
    url: "/orders",
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
