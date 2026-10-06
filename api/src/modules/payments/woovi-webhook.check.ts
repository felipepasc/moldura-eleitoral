import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";
import { createTestApp, signWoovi } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;
let logs = "";

function logSink() {
  return new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });
}

beforeEach(async () => {
  logs = "";
  t = await createTestApp({ logStream: logSink() });
});

afterEach(async () => {
  await t.close();
});

async function createPendingOrder() {
  const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 10, g: 10, b: 200 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("candidateId", "lula");
  form.append("framing", JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 }));
  form.append("consent", "true");
  form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "foto.jpg");
  const request = new Request("http://localhost", { method: "POST", body: form });

  const res = await t.app.inject({
    method: "POST",
    url: "/orders",
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  });

  return { orderId: res.json().id as string, pixId: t.gateway.created[t.gateway.created.length - 1] };
}

type SendOptions = { signature?: string | null; forged?: boolean; raw?: string };

function send(body: unknown, options: SendOptions = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const signature = options.signature === undefined ? signWoovi(raw, options.forged) : options.signature;

  if (signature !== null) {
    headers["x-webhook-signature"] = signature;
  }

  return t.app.inject({ method: "POST", url: "/webhooks/woovi", payload: raw, headers });
}

async function statusOf(orderId: string) {
  const [row] = await t.db.select().from(orders).where(eq(orders.id, orderId));

  return row.status;
}

const completed = (correlationID: string) => ({ event: "OPENPIX:CHARGE_COMPLETED", charge: { correlationID, status: "COMPLETED" } });

test("assinatura válida e gateway PAID libera o pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const res = await send(completed(pixId));

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("assinatura forjada, ausente ou corpo adulterado: 401 genérico e nada gravado", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const body = completed(pixId);
  const tampered = JSON.stringify({ ...body, extra: 1 });

  const results = [
    await send(body, { forged: true }),
    await send(body, { signature: null }),
    await send(body, { signature: "lixo" }),
    await send(body, { raw: tampered, signature: signWoovi(JSON.stringify(body)) }),
  ];

  for (const res of results) {
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: "Não autorizado." });
  }

  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
  assert.equal(await statusOf(orderId), "pending");
});

test("assinatura válida mas a Woovi ainda diz ACTIVE: pedido continua pendente e o evento é liberado para reenvio", async () => {
  const { orderId, pixId } = await createPendingOrder();

  const res = await send(completed(pixId));

  assert.equal(res.statusCode, 503);
  assert.equal(await statusOf(orderId), "pending");
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);

  t.gateway.statuses.set(pixId, "PAID");
  const retry = await send(completed(pixId));

  assert.equal(retry.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("entrega duplicada é idempotente", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const first = await send(completed(pixId));
  const second = await send(completed(pixId));

  assert.equal(first.statusCode, 200);
  assert.equal(second.json().duplicate, true);
  assert.equal(t.storage.puts.filter((key) => key.startsWith("results/")).length, 1);
  assert.equal(await statusOf(orderId), "paid");
  assert.equal((await t.db.select().from(webhookEvents)).length, 1);
});

test("evento de teste (sem charge) e outros eventos respondem 200 sem mexer em nada", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const testEvent = await send({ data_criacao: "2024-01-23T20:32:14.429Z", event: "OPENPIX:CHARGE_COMPLETED" });
  const other = await send({ event: "OPENPIX:CHARGE_EXPIRED", charge: { correlationID: pixId } });

  assert.equal(testEvent.statusCode, 200);
  assert.equal(other.statusCode, 200);
  assert.equal(await statusOf(orderId), "pending");
});

test("a Woovi fora do ar na reconsulta devolve 503, libera o evento e o reenvio funciona", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  t.gateway.failCheck = true;

  const res = await send(completed(pixId));

  assert.equal(res.statusCode, 503);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);

  t.gateway.failCheck = false;
  const retry = await send(completed(pixId));

  assert.equal(retry.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("corpo acima de 256 KB devolve 413 e correlationID desconhecido é ignorado", async () => {
  const big = await send({ event: "x", pad: "a".repeat(300 * 1024) });
  const unknown = await send(completed("nao-existe"));

  assert.equal(big.statusCode, 413);
  assert.equal(unknown.statusCode, 200);
  assert.equal((await t.db.select().from(orders)).length, 0);
});

test("JSON inválido com assinatura válida devolve 400 e nada é gravado", async () => {
  const res = await send(null, { raw: "{não é json" });

  assert.equal(res.statusCode, 400);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("os logs do webhook da Woovi não têm assinatura, corpo, ids nem chaves", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const raw = JSON.stringify(completed(pixId));
  const signature = signWoovi(raw);

  await send(null, { raw, signature });
  await send(completed(pixId), { forged: true });
  t.gateway.failCheck = true;
  await send({ event: "OPENPIX:CHARGE_COMPLETED", charge: { correlationID: pixId }, n: 2 });

  assert.ok(logs.length > 0);
  assert.ok(!logs.includes(signature));
  assert.ok(!logs.includes(orderId));
  assert.ok(!logs.includes("BEGIN PUBLIC KEY"));
});

test("rate limit do webhook da Woovi", async () => {
  await t.close();
  t = await createTestApp({ webhookPerMinute: 2, logStream: logSink() });

  assert.equal((await send({ event: "x" })).statusCode, 200);
  assert.equal((await send({ event: "y" })).statusCode, 200);
  assert.equal((await send({ event: "z" })).statusCode, 429);
});
