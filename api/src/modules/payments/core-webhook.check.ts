import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";
import { CORE_WEBHOOK_SECRET, createTestApp, signCore } from "@/scripts/fixtures/test-app";
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

type SendOptions = { raw?: string; headers?: Record<string, string> | null; id?: string; timestamp?: number; secret?: string };

function send(body: unknown, options: SendOptions = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const signed = options.headers === undefined ? signCore(raw, { id: options.id, timestamp: options.timestamp, secret: options.secret }) : (options.headers ?? {});

  return t.app.inject({ method: "POST", url: "/webhooks/core", payload: raw, headers: { "content-type": "application/json", ...signed } });
}

async function statusOf(orderId: string) {
  const [row] = await t.db.select().from(orders).where(eq(orders.id, orderId));

  return row.status;
}

let seq = 0;

function paid(externalId: string, id = `evt_${++seq}`) {
  return { id, type: "charge.paid", timestamp: new Date().toISOString(), previousStatus: "open", data: { externalId, status: "paid", totalCents: 399 } };
}

test("aviso charge.paid assinado e o Core confirmando libera o pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const res = await send(paid(pixId));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { received: true, processed: true });
  assert.equal(await statusOf(orderId), "paid");
});

test("assinatura de outro segredo, ausente, velha ou corpo adulterado: 400 e nada gravado", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const body = paid(pixId);
  const raw = JSON.stringify(body);
  const other = `whsec_${Buffer.from("outro-segredo-qualquer-123456").toString("base64")}`;

  const results = [
    await send(body, { secret: other }),
    await send(body, { headers: null }),
    await send(body, { headers: { "webhook-id": "evt_x", "webhook-timestamp": String(Math.floor(Date.now() / 1000)), "webhook-signature": "v1,lixo" } }),
    await send(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }),
    await send(null, { raw: JSON.stringify({ ...body, data: { ...body.data, externalId: "outro" } }), headers: signCore(raw) }),
  ];

  for (const res of results) {
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: "Evento inválido." });
  }

  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
  assert.equal(await statusOf(orderId), "pending");
});

test("aviso pago mas a cobrança ainda aberta na reconsulta: 503, evento liberado e o reenvio funciona", async () => {
  const { orderId, pixId } = await createPendingOrder();
  const event = paid(pixId);

  const res = await send(event, { id: event.id });

  assert.equal(res.statusCode, 503);
  assert.equal(await statusOf(orderId), "pending");
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);

  t.gateway.statuses.set(pixId, "PAID");
  const retry = await send(event, { id: event.id });

  assert.equal(retry.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("o mesmo aviso repetido é idempotente", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const event = paid(pixId);

  const first = await send(event);
  const second = await send(event);

  assert.equal(first.statusCode, 200);
  assert.equal(second.json().duplicate, true);
  assert.equal(t.storage.puts.filter((key) => key.startsWith("results/")).length, 1);
  assert.equal(await statusOf(orderId), "paid");
});

test("outros avisos (teste, pagamento expirado) e cobrança desconhecida respondem 200 sem mexer em nada", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const testEvent = await send({ id: "evt_t", type: "webhook.test", timestamp: new Date().toISOString(), previousStatus: null, data: { message: "oi", endpointId: 1 } });
  const expired = await send({ id: "evt_e", type: "payment.expired", timestamp: new Date().toISOString(), previousStatus: "pending", data: { chargeExternalId: pixId, status: "expired" } });
  const unknown = await send(paid("nao-existe"));

  for (const res of [testEvent, expired, unknown]) {
    assert.equal(res.statusCode, 200);
  }

  assert.equal(await statusOf(orderId), "pending");
});

test("Core fora do ar na reconsulta devolve 503 e libera o evento", async () => {
  const { pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  t.gateway.failCheck = true;

  const res = await send(paid(pixId));

  assert.equal(res.statusCode, 503);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("JSON inválido com assinatura válida e corpo acima de 256 KB são recusados", async () => {
  const invalid = await send(null, { raw: "{não é json" });
  const big = await send({ id: "x", type: "charge.paid", pad: "a".repeat(300 * 1024) });

  assert.equal(invalid.statusCode, 400);
  assert.equal(big.statusCode, 413);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("os logs do webhook do Core não têm assinatura, segredo nem id do pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const raw = JSON.stringify(paid(pixId));
  const headers = signCore(raw);

  t.gateway.failCheck = true;
  await send(null, { raw, headers });
  await send(paid(pixId), { secret: `whsec_${Buffer.from("x".repeat(24)).toString("base64")}` });

  assert.ok(logs.length > 0);
  assert.ok(!logs.includes(headers["webhook-signature"].slice(3)));
  assert.ok(!logs.includes(CORE_WEBHOOK_SECRET));
  assert.ok(!logs.includes(orderId));
});
