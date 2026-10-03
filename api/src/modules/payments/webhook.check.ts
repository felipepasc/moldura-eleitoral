import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";
import { WEBHOOK_SECRET, createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;
let logs = "";

beforeEach(async () => {
  logs = "";
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });

  t = await createTestApp({ logStream });
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

function webhook(body: unknown, secret: string | null = WEBHOOK_SECRET) {
  const query = secret === null ? "" : `?webhookSecret=${secret}`;

  return t.app.inject({ method: "POST", url: `/webhooks/abacatepay${query}`, payload: body as object });
}

async function statusOf(orderId: string) {
  const [row] = await t.db.select().from(orders).where(eq(orders.id, orderId));

  return row.status;
}

test("sem segredo ou com segredo errado devolve 401 e não registra evento", async () => {
  const { pixId } = await createPendingOrder();
  const body = { event: "transparent.completed", data: { id: pixId } };

  assert.equal((await webhook(body, null)).statusCode, 401);
  assert.equal((await webhook(body, "errado")).statusCode, 401);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("evento de pago com a AbacatePay confirmando PAID libera o pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const res = await webhook({ event: "transparent.completed", data: { id: pixId } });

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("webhook repetido é idempotente: uma só imagem", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const body = { event: "transparent.completed", data: { id: pixId } };

  const first = await webhook(body);
  const second = await webhook(body);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().duplicate, true);
  assert.equal(t.storage.puts.filter((key) => key.startsWith("results/")).length, 1);
  assert.equal(await statusOf(orderId), "paid");
});

test("webhook de pago forjado (AbacatePay diz PENDING) não libera o pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();

  const res = await webhook({ event: "transparent.completed", data: { id: pixId } });

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(orderId), "pending");
  assert.equal(t.storage.puts.filter((key) => key.startsWith("results/")).length, 0);
});

test("evento desconhecido e Pix desconhecido respondem 200 sem mexer em nada", async () => {
  const { orderId } = await createPendingOrder();

  const other = await webhook({ event: "billing.something", data: { id: "x" } });
  const unknownPix = await webhook({ event: "transparent.completed", data: { id: "pix_que_nao_existe" } });

  assert.equal(other.statusCode, 200);
  assert.equal(unknownPix.statusCode, 200);
  assert.equal(unknownPix.json().processed, false);
  assert.equal(await statusOf(orderId), "pending");
});

test("a AbacatePay fora do ar no webhook devolve 503, libera o evento e o reenvio funciona", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  t.gateway.failCheck = true;
  const body = { event: "billing.paid", data: { id: pixId } };

  const res = await webhook(body);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { error: "Tente novamente." });
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
  assert.equal(await statusOf(orderId), "pending");

  t.gateway.failCheck = false;
  const retry = await webhook(body);

  assert.equal(retry.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("webhook responde no-store e respeita o rate limit", async () => {
  await t.close();
  t = await createTestApp({ webhookPerMinute: 2, logStream: new Writable({ write: (_c, _e, cb) => cb() }) });

  const first = await webhook({ event: "x.y", id: "1" });
  await webhook({ event: "x.y", id: "2" });
  const third = await webhook({ event: "x.y", id: "3" });

  assert.equal(first.headers["cache-control"], "no-store");
  assert.equal(third.statusCode, 429);
});

test("eventos sem id no topo não se confundem; payload idêntico repetido é deduplicado", async () => {
  const first = { event: "x.y", data: { id: "mesmo", valor: 1 } };
  const second = { event: "x.y", data: { id: "mesmo", valor: 2 } };

  await webhook(first);
  const other = await webhook(second);
  const repeated = await webhook(first);

  assert.equal(other.json().duplicate, undefined);
  assert.equal(repeated.json().duplicate, true);
  assert.equal((await t.db.select().from(webhookEvents)).length, 2);
});

test("com id no topo o evento é event:id", async () => {
  await webhook({ event: "x.y", id: "abc", data: {} });

  const [row] = await t.db.select().from(webhookEvents);

  assert.equal(row.eventId, "x.y:abc");
});

test("a tabela de eventos não guarda o corpo", async () => {
  await webhook({ event: "x.y", id: "abc", data: { cpf: "123.456.789-00" } });

  const [row] = await t.db.select().from(webhookEvents);

  assert.equal(JSON.stringify(row).includes("123.456"), false);
  assert.equal("payload" in row, false);
});

test("corpo acima de 256 KB devolve 413 e não grava nada", async () => {
  const res = await t.app.inject({
    method: "POST",
    url: `/webhooks/abacatepay?webhookSecret=${WEBHOOK_SECRET}`,
    payload: { event: "x.y", data: { lixo: "a".repeat(300 * 1024) } },
  });

  assert.equal(res.statusCode, 413);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("payload com dois pixIds sincroniza os dois pedidos", async () => {
  const a = await createPendingOrder();
  const b = await createPendingOrder();
  t.gateway.statuses.set(a.pixId, "PAID");
  t.gateway.statuses.set(b.pixId, "PAID");

  const res = await webhook({ event: "transparent.completed", data: { items: [{ id: a.pixId }, { id: b.pixId }] } });

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(a.orderId), "paid");
  assert.equal(await statusOf(b.orderId), "paid");
});

test("o alias ?secret= não é aceito", async () => {
  const res = await t.app.inject({
    method: "POST",
    url: `/webhooks/abacatepay?secret=${WEBHOOK_SECRET}`,
    payload: { event: "x.y", id: "1" },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: "invalid_secret" });
});

test("logs não contêm o uuid do pedido nem chaves do storage", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  await webhook({ event: "transparent.completed", data: { id: pixId } });
  await t.app.inject({ method: "GET", url: `/orders/${orderId}` });

  assert.ok(logs.length > 0);
  assert.equal(logs.includes(orderId), false);
  assert.equal(logs.includes("photos/"), false);
  assert.equal(logs.includes("results/"), false);
});

test("o segredo do webhook não aparece nos logs", async () => {
  const { pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  await webhook({ event: "transparent.completed", data: { id: pixId } });
  await webhook({ event: "transparent.completed", data: { id: pixId } }, "errado");

  assert.ok(logs.length > 0, "o teste precisa capturar logs");
  assert.equal(logs.includes(WEBHOOK_SECRET), false);
  assert.equal(logs.includes("webhookSecret"), false);
});

test("o segredo não aparece nos logs nem nas respostas quando a reconsulta falha ou o corpo é inválido", async () => {
  const { pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  t.gateway.failCheck = true;

  const failed = await webhook({ event: "transparent.completed", data: { id: pixId } });
  const invalid = await webhook({ semEvento: true });
  const unauthorized = await webhook({ event: "x" }, "errado");

  assert.equal(failed.statusCode, 503);
  assert.equal(invalid.statusCode, 400);
  assert.equal(unauthorized.body.includes(WEBHOOK_SECRET), false);
  assert.ok(logs.length > 0, "o teste precisa capturar logs");
  assert.equal(logs.includes(WEBHOOK_SECRET), false);
  assert.equal(logs.includes("webhookSecret"), false);
  assert.equal(logs.includes("errado"), false);
});

test("event ou id gigantes devolvem 400 genérico e não gravam nada", async () => {
  const huge = "a".repeat(201);

  const bigEvent = await webhook({ event: huge });
  const bigId = await webhook({ event: "billing.paid", id: huge });

  assert.equal(bigEvent.statusCode, 400);
  assert.equal(bigId.statusCode, 400);
  assert.deepEqual(bigEvent.json(), { error: "Evento inválido." });
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("falha ao liberar o evento no 503 ainda devolve 503 e loga só o erro", async () => {
  const { pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  t.gateway.failCheck = true;
  const database = t.ctx.db as unknown as { delete: unknown };
  const originalDelete = database.delete;
  database.delete = () => {
    throw new Error("falha ao apagar photos/segredo.jpg");
  };

  const res = await webhook({ event: "billing.paid", data: { id: pixId } });
  database.delete = originalDelete;

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { error: "Tente novamente." });
  assert.ok(logs.includes("Não consegui liberar o evento do webhook"));
  assert.ok(!logs.includes("segredo.jpg"));
});