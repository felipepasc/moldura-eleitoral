import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@/core/db";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";

const { db, sql } = createDb(process.env.DATABASE_URL ?? "");

after(async () => {
  await sql.end();
});

test("as tabelas existem depois da migração", async () => {
  const orderRows = await db.select().from(orders).limit(1);
  const eventRows = await db.select().from(webhookEvents).limit(1);

  assert.ok(Array.isArray(orderRows));
  assert.ok(Array.isArray(eventRows));
});

test("pix_id é único", async () => {
  await db.delete(orders);

  const values = {
    candidateId: "lula",
    framing: { zoom: 1, offsetX: 0, offsetY: 0 },
    pixId: "pix_dup",
    pixBrCode: "000",
    pixBrCodeBase64: "QUJD",
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 60_000),
  };

  await db.insert(orders).values(values);

  await assert.rejects(db.insert(orders).values(values));

  await db.delete(orders);
});
