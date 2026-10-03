import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orderRef } from "@/core/log-ref";
import { orders } from "@/modules/orders/schema";
import { cleanupOrders, deleteGuarded } from "@/modules/orders/services/cleanup";
import { webhookEvents } from "@/modules/payments/schema";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const LINE_BREAK = String.fromCharCode(10);
let clock = Date.now();
let t: TestApp;
let logs = "";

beforeEach(async () => {
  clock = Date.now();
  logs = "";
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });

  t = await createTestApp({ now: () => new Date(clock), logStream });
});

afterEach(async () => {
  await t.close();
});

async function insertOrder(values: Partial<typeof orders.$inferInsert> & { pixId: string }) {
  const [row] = await t.db
    .insert(orders)
    .values({
      candidateId: "lula",
      framing: { zoom: 1, offsetX: 0, offsetY: 0 },
      pixBrCode: "000",
      pixBrCodeBase64: "QUJD",
        expiresAt: new Date(clock + 1800_000),
      ...values,
    })
    .returning();

  return row;
}

async function exists(id: string) {
  return (await t.db.select().from(orders).where(eq(orders.id, id))).length === 1;
}

test("apaga pedido não pago com mais de 24 h junto com a foto", async () => {
  await t.storage.put("photos/old.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p1", photoKey: "photos/old.jpg", createdAt: new Date(clock - 25 * HOUR) });
  await t.storage.put("photos/new.jpg", Buffer.from("x"), "image/jpeg");
  const fresh = await insertOrder({ pixId: "p2", photoKey: "photos/new.jpg", createdAt: new Date(clock - 1 * HOUR) });
  await t.storage.put("photos/exp.jpg", Buffer.from("x"), "image/jpeg");
  const expired = await insertOrder({ pixId: "p2b", status: "expired", photoKey: "photos/exp.jpg", createdAt: new Date(clock - 30 * HOUR) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 2);
  assert.equal(await exists(old.id), false);
  assert.equal(await exists(expired.id), false);
  assert.equal(t.storage.files.has("photos/old.jpg"), false);
  assert.equal(t.storage.files.has("photos/exp.jpg"), false);
  assert.equal(await exists(fresh.id), true);
  assert.equal(t.storage.files.has("photos/new.jpg"), true);
});

test("pedido pago com mais de 7 dias perde imagem, foto sobrando e o registro inteiro", async () => {
  await t.storage.put("results/a.png", Buffer.from("x"), "image/png");
  await t.storage.put("photos/a.jpg", Buffer.from("x"), "image/jpeg");
  const paid = await insertOrder({
    pixId: "p3",
    status: "paid",
    resultKey: "results/a.png",
    photoKey: "photos/a.jpg",
    paidAt: new Date(clock - 8 * DAY),
  });
  await t.storage.put("results/b.png", Buffer.from("x"), "image/png");
  const recent = await insertOrder({ pixId: "p3b", status: "paid", resultKey: "results/b.png", paidAt: new Date(clock - 2 * DAY) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 1);
  assert.equal(await exists(paid.id), false);
  assert.equal(t.storage.files.has("results/a.png"), false);
  assert.equal(t.storage.files.has("photos/a.jpg"), false);
  assert.equal(await exists(recent.id), true);
  assert.equal(t.storage.files.has("results/b.png"), true);
});

test("pedido pago recente com photoKey sobrando apaga a foto e zera photoKey", async () => {
  await t.storage.put("photos/left.jpg", Buffer.from("x"), "image/jpeg");
  await t.storage.put("results/keep.png", Buffer.from("x"), "image/png");
  const paid = await insertOrder({
    pixId: "p5",
    status: "paid",
    photoKey: "photos/left.jpg",
    resultKey: "results/keep.png",
    paidAt: new Date(clock - 1 * DAY),
  });

  const result = await cleanupOrders(t.ctx);

  const [row] = await t.db.select().from(orders).where(eq(orders.id, paid.id));
  assert.equal(result.removed, 0);
  assert.equal(row.photoKey, null);
  assert.equal(row.resultKey, "results/keep.png");
  assert.equal(t.storage.files.has("photos/left.jpg"), false);
  assert.equal(t.storage.files.has("results/keep.png"), true);
});

test("paid_failed: com menos de 3 dias não mexe; com mais apaga e avisa o operador depois", async () => {
  await t.storage.put("photos/f1.jpg", Buffer.from("x"), "image/jpeg");
  const young = await insertOrder({ pixId: "p4", status: "paid_failed", photoKey: "photos/f1.jpg", createdAt: new Date(clock - 2 * DAY) });
  await t.storage.put("photos/f2.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p4b", status: "paid_failed", photoKey: "photos/f2.jpg", createdAt: new Date(clock - 4 * DAY) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 1);
  assert.equal(await exists(young.id), true);
  assert.equal(t.storage.files.has("photos/f1.jpg"), true);
  assert.equal(await exists(old.id), false);
  assert.equal(t.storage.files.has("photos/f2.jpg"), false);
  assert.ok(logs.includes("Pedido pago sem imagem apagado"));
  assert.ok(logs.includes(orderRef(old.id)));
  assert.ok(!logs.includes(old.id));
});

test("falha ao remover arquivo de pedido pago antigo mantém a linha; na próxima rodada apaga", async () => {
  await t.storage.put("results/r.png", Buffer.from("x"), "image/png");
  const paid = await insertOrder({ pixId: "p7", status: "paid", resultKey: "results/r.png", paidAt: new Date(clock - 8 * DAY) });
  const originalRemove = t.storage.remove;
  t.storage.remove = async () => {
    throw new Error("storage fora do ar");
  };

  const first = await cleanupOrders(t.ctx);

  assert.equal(first.removed, 0);
  assert.equal(await exists(paid.id), true);
  assert.ok(logs.includes(orderRef(paid.id)));
  assert.ok(!logs.includes("results/"));

  t.storage.remove = originalRemove;
  const second = await cleanupOrders(t.ctx);

  assert.equal(second.removed, 1);
  assert.equal(await exists(paid.id), false);
  assert.equal(t.storage.files.has("results/r.png"), false);
});

test("pedido pago com paidAt nulo e createdAt antigo também é apagado", async () => {
  const paid = await insertOrder({ pixId: "p8", status: "paid", paidAt: null, createdAt: new Date(clock - 9 * DAY) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 1);
  assert.equal(await exists(paid.id), false);
});

test("pedido não pago que a AbacatePay diz estar PAGO na limpeza não é apagado e vira paid", async () => {
  const photo = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 200, b: 10 } } })
    .jpeg()
    .toBuffer();
  await t.storage.put("photos/late.jpg", photo, "image/jpeg");
  const late = await insertOrder({ pixId: "p9", photoKey: "photos/late.jpg", createdAt: new Date(clock - 30 * HOUR) });
  t.gateway.statuses.set("p9", "PAID");

  const result = await cleanupOrders(t.ctx);

  const [row] = await t.db.select().from(orders).where(eq(orders.id, late.id));
  assert.equal(result.removed, 0);
  assert.equal(row.status, "paid");
  assert.ok(row.resultKey);
});

test("gateway fora do ar: pedido não pago antigo é pulado e não apagado", async () => {
  await t.storage.put("photos/skip.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p10", photoKey: "photos/skip.jpg", createdAt: new Date(clock - 30 * HOUR) });
  t.gateway.failCheck = true;

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 0);
  assert.equal(await exists(old.id), true);
  assert.equal(t.storage.files.has("photos/skip.jpg"), true);
  assert.ok(logs.includes(orderRef(old.id)));
});

test("a exclusão protegida não apaga linha cujo status mudou para paid", async () => {
  await t.storage.put("photos/race.jpg", Buffer.from("x"), "image/jpeg");
  const row = await insertOrder({ pixId: "p11", photoKey: "photos/race.jpg", createdAt: new Date(clock - 30 * HOUR) });

  await t.db
    .update(orders)
    .set({ status: "paid", paidAt: new Date(clock) })
    .where(eq(orders.id, row.id));

  const deleted = await deleteGuarded(t.ctx, row.id, ["pending", "expired"], new Date(clock - 24 * HOUR));

  assert.equal(deleted, null);
  assert.equal(await exists(row.id), true);
  assert.equal(t.storage.files.has("photos/race.jpg"), true);
});

test("falha ao remover a foto depois do delete avisa foto órfã sem chaves", async () => {
  await t.storage.put("photos/orph.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p12", photoKey: "photos/orph.jpg", createdAt: new Date(clock - 30 * HOUR) });
  t.storage.remove = async (key) => {
    throw new Error(`falhou ${key}`);
  };

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 1);
  assert.equal(await exists(old.id), false);
  assert.ok(logs.includes("Foto órfã"));
  assert.ok(!logs.includes("orph.jpg"));
});

test("apaga webhook_events com mais de 30 dias e mantém os recentes", async () => {
  await t.db.insert(webhookEvents).values([
    { eventId: "old", event: "billing.paid", receivedAt: new Date(clock - 31 * DAY) },
    { eventId: "new", event: "billing.paid", receivedAt: new Date(clock - 1 * DAY) },
  ]);

  await cleanupOrders(t.ctx);

  const left = await t.db.select().from(webhookEvents);
  assert.deepEqual(left.map((row) => row.eventId), ["new"]);
});

test("a limpeza não loga chaves de arquivo nem ids de pedido, nem quando a remoção falha", async () => {
  await t.storage.put("photos/secret-name.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p6", photoKey: "photos/secret-name.jpg", createdAt: new Date(clock - 30 * HOUR) });
  t.storage.remove = async (key) => {
    throw new Error(`falhou ${key}`);
  };

  await cleanupOrders(t.ctx);

  assert.ok(logs.length > 0);
  assert.ok(!logs.includes("secret-name"));
  assert.ok(!logs.includes("photos/"));
  assert.ok(!logs.includes(old.id));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(logs));
});

test("teto de retenção: com a AbacatePay fora do ar, não pago >3 dias e paid_failed >5 dias somem; o resto fica", async () => {
  t.gateway.failCheck = true;
  await t.storage.put("photos/u25.jpg", Buffer.from("x"), "image/jpeg");
  const recent = await insertOrder({ pixId: "h1", photoKey: "photos/u25.jpg", createdAt: new Date(clock - 25 * HOUR) });
  await t.storage.put("photos/u4.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "h2", photoKey: "photos/u4.jpg", createdAt: new Date(clock - 4 * DAY) });
  const expiredOld = await insertOrder({ pixId: "h3", status: "expired", createdAt: new Date(clock - 4 * DAY) });
  const failed4 = await insertOrder({ pixId: "h4", status: "paid_failed", createdAt: new Date(clock - 4 * DAY) });
  const failed6 = await insertOrder({ pixId: "h5", status: "paid_failed", createdAt: new Date(clock - 6 * DAY) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 3);
  assert.equal(await exists(recent.id), true);
  assert.equal(await exists(old.id), false);
  assert.equal(await exists(expiredOld.id), false);
  assert.equal(t.storage.files.has("photos/u4.jpg"), false);
  assert.equal(await exists(failed4.id), true);
  assert.equal(await exists(failed6.id), false);
});

test("o teto de retenção não apaga pedido que mudou para paid (exclusão protegida)", async () => {
  const row = await insertOrder({ pixId: "h6", createdAt: new Date(clock - 4 * DAY) });
  await t.db
    .update(orders)
    .set({ status: "paid", paidAt: new Date(clock) })
    .where(eq(orders.id, row.id));

  assert.equal(await deleteGuarded(t.ctx, row.id, ["pending", "expired"], new Date(clock - 3 * DAY)), null);
  assert.equal(await exists(row.id), true);
});

test("pedido pago sem imagem: criação do paid_failed e apagamento logam pixId e nada mais sensível", async () => {
  await t.storage.put("photos/pf.jpg", Buffer.from("not an image"), "image/jpeg");
  const row = await insertOrder({ pixId: "pix_trace_1", photoKey: "photos/pf.jpg" });
  t.gateway.statuses.set("pix_trace_1", "PAID");

  await t.app.inject({ method: "GET", url: `/orders/${row.id}` });

  const created = logs.split(LINE_BREAK).filter((line) => line.includes("Pedido pago sem imagem"));
  assert.equal(created.length, 1);
  assert.ok(created[0].includes("pix_trace_1"));
  assert.ok(created[0].includes(orderRef(row.id)));

  await t.db
    .update(orders)
    .set({ createdAt: new Date(clock - 4 * DAY) })
    .where(eq(orders.id, row.id));
  logs = "";

  const result = await cleanupOrders(t.ctx);

  const deleted = logs.split(LINE_BREAK).filter((line) => line.includes("Pedido pago sem imagem apagado"));
  assert.equal(result.removed, 1);
  assert.equal(deleted.length, 1);
  assert.ok(deleted[0].includes("pix_trace_1"));
  assert.ok(deleted[0].includes(orderRef(row.id)));
  assert.ok(!logs.includes("photos/"));
  assert.ok(!logs.includes(row.id));
});

test("pixId não aparece em nenhum outro log da limpeza", async () => {
  await insertOrder({ pixId: "pix_quiet_9", createdAt: new Date(clock - 4 * DAY) });
  t.gateway.failCheck = true;

  await cleanupOrders(t.ctx);

  assert.ok(logs.length > 0);
  assert.ok(!logs.includes("pix_quiet_9"));
});
