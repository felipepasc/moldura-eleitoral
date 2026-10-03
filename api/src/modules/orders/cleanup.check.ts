import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { orderRef } from "@/core/log-ref";
import { orders } from "@/modules/orders/schema";
import { cleanupOrders } from "@/modules/orders/services/cleanup";
import { webhookEvents } from "@/modules/payments/schema";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
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
      ipAddress: "127.0.0.1",
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

test("paid_failed: com menos de 14 dias não mexe; com mais apaga tudo e avisa o operador", async () => {
  await t.storage.put("photos/f1.jpg", Buffer.from("x"), "image/jpeg");
  const young = await insertOrder({ pixId: "p4", status: "paid_failed", photoKey: "photos/f1.jpg", createdAt: new Date(clock - 10 * DAY) });
  await t.storage.put("photos/f2.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p4b", status: "paid_failed", photoKey: "photos/f2.jpg", createdAt: new Date(clock - 15 * DAY) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 1);
  assert.equal(await exists(young.id), true);
  assert.equal(t.storage.files.has("photos/f1.jpg"), true);
  assert.equal(await exists(old.id), false);
  assert.equal(t.storage.files.has("photos/f2.jpg"), false);
  assert.ok(logs.includes('"level":40'));
  assert.ok(logs.includes(orderRef(old.id)));
  assert.ok(!logs.includes(old.id));
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
