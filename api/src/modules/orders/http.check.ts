import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.close();
});

test("GET /orders/:id aceita 300 por minuto por IP e bloqueia a 301ª", async () => {
  const url = "/orders/6b1f9a52-5a43-4d52-8d52-0a8f2f0a0000";

  for (let index = 0; index < 300; index += 1) {
    const res = await t.app.inject({ method: "GET", url });

    assert.equal(res.statusCode, 404);
  }

  assert.equal((await t.app.inject({ method: "GET", url })).statusCode, 429);
});

test("toda resposta da api leva X-Content-Type-Options: nosniff", async () => {
  const health = await t.app.inject({ method: "GET", url: "/healthz" });
  const missing = await t.app.inject({ method: "GET", url: "/nao-existe" });
  const order = await t.app.inject({ method: "GET", url: "/orders/abc" });
  const webhook = await t.app.inject({ method: "POST", url: "/webhooks/abacatepay", payload: {} });

  for (const res of [health, missing, order, webhook]) {
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  }
});

test("campos demais no multipart devolvem 400 genérico, não o aviso de foto grande", async () => {
  const form = new FormData();

  for (let index = 0; index < 8; index += 1) {
    form.append(`extra${index}`, "x");
  }

  form.append("photo", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "foto.jpg");
  const request = new Request("http://localhost", { method: "POST", body: form });

  const res = await t.app.inject({
    method: "POST",
    url: "/orders",
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: "Dados do pedido inválidos." });
});

test("a resposta 429 expõe Retry-After ao navegador via CORS", async () => {
  await t.close();
  t = await createTestApp({ orderReadsPerMinute: 1 });
  const url = "/orders/6b1f9a52-5a43-4d52-8d52-0a8f2f0a0000";
  const headers = { origin: "http://localhost:6610" };

  await t.app.inject({ method: "GET", url, headers });
  const blocked = await t.app.inject({ method: "GET", url, headers });

  assert.equal(blocked.statusCode, 429);
  assert.match(String(blocked.headers["access-control-expose-headers"]), /Retry-After/i);
  assert.ok(blocked.headers["retry-after"]);
});
