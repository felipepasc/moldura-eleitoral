import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { orders } from "@/modules/orders/schema";
import { refreshOrder, syncOrder, trackedOrderCount } from "@/modules/orders/services/sync-order";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let clock = Date.now();
let t: TestApp;
let checks = 0;

beforeEach(async () => {
  clock = Date.now();
  checks = 0;
  t = await createTestApp({ now: () => new Date(clock) });
  const original = t.gateway.checkPix;
  t.gateway.checkPix = async (id) => {
    checks += 1;

    return original(id);
  };
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

test("duas consultas seguidas ao mesmo pedido fazem uma só chamada à AbacatePay", async () => {
  const row = await insertOrder({ pixId: "t1" });

  await refreshOrder(t.ctx, row.id);
  await refreshOrder(t.ctx, row.id);

  assert.equal(checks, 1);

  clock += 6000;
  await refreshOrder(t.ctx, row.id);

  assert.equal(checks, 2);
});

test("o webhook força a consulta mesmo dentro da janela de 5 s", async () => {
  const row = await insertOrder({ pixId: "t2" });

  await syncOrder(t.ctx, row.id);
  await syncOrder(t.ctx, row.id, { force: true });

  assert.equal(checks, 2);
});

test("paid_failed refaz a montagem no máximo uma vez a cada 30 s", async () => {
  await t.storage.put("photos/bad.jpg", Buffer.from("não é imagem"), "image/jpeg");
  const row = await insertOrder({ pixId: "t3", status: "paid_failed", photoKey: "photos/bad.jpg" });
  let gets = 0;
  const originalGet = t.storage.get;
  t.storage.get = async (key) => {
    gets += 1;

    return originalGet(key);
  };

  await syncOrder(t.ctx, row.id);
  await syncOrder(t.ctx, row.id);
  clock += 10_000;
  await syncOrder(t.ctx, row.id);

  assert.equal(gets, 1);

  clock += 25_000;
  await syncOrder(t.ctx, row.id);

  assert.equal(gets, 2);

  await syncOrder(t.ctx, row.id, { force: true });

  assert.equal(gets, 3);
});

test("o mapa de controle é limpo quando o pedido paga e é limitado em tamanho", { timeout: 120_000 }, async () => {
  const row = await insertOrder({ pixId: "t4" });
  await t.storage.put("photos/ok.jpg", await (await import("sharp")).default({ create: { width: 50, height: 50, channels: 3, background: "#123456" } }).jpeg().toBuffer(), "image/jpeg");
  await t.db
    .update(orders)
    .set({ photoKey: "photos/ok.jpg" })
    .where(eq(orders.id, row.id));

  await syncOrder(t.ctx, row.id);
  assert.equal(trackedOrderCount(t.ctx), 1);

  t.gateway.statuses.set("t4", "PAID");
  clock += 6000;
  const paid = await syncOrder(t.ctx, row.id);

  assert.equal(paid?.status, "paid");
  assert.equal(trackedOrderCount(t.ctx), 0);

  const rows = Array.from({ length: 5100 }, (_unused, index) => ({
    candidateId: "lula",
    framing: { zoom: 1, offsetX: 0, offsetY: 0 },
    pixId: `bulk_${index}`,
    pixBrCode: "000",
    pixBrCodeBase64: "QUJD",
    expiresAt: new Date(clock + 1800_000),
  }));
  const inserted = await t.db
    .insert(orders)
    .values(rows)
    .returning({ id: orders.id });

  for (const item of inserted) {
    await syncOrder(t.ctx, item.id);
  }

  assert.ok(trackedOrderCount(t.ctx) <= 5000);
});
