import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { cleanupOrders } from "@/modules/orders/services/cleanup";
import { createClient } from "@felipepasc/core-sdk";
import { createCoreGateway } from "@/modules/payments/core";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;
let logs = "";

beforeEach(async () => {
  logs = "";
  t = await createTestApp({
    framesDir: "/pasta/que/nao/existe",
    logStream: new Writable({
      write(chunk, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    }),
  });
});

afterEach(async () => {
  await t.close();
});

async function postOrder() {
  const photo = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("candidateId", "lula");
  form.append("framing", JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 }));
  form.append("consent", "true");
  form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "foto.jpg");
  const request = new Request("http://localhost", { method: "POST", body: form });

  return t.app.inject({
    method: "POST",
    url: "/orders",
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  });
}

test("a referência enviada ao gateway é separada do id do pedido", async () => {
  const res = await postOrder();
  const id = res.json().id as string;
  const [row] = await t.db.select().from(orders).where(eq(orders.id, id));

  assert.equal(res.statusCode, 201);
  assert.notEqual(row.pixId, id);
  assert.notEqual(t.gateway.inputs[0].reference, id);
  assert.ok(t.gateway.inputs[0].reference.length >= 32);
});

test("nada enviado ao Core contém o id do pedido e o pixId guardado é o externalId da cobrança", async () => {
  const bodies: string[] = [];
  const urls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    urls.push(String(input));
    bodies.push(typeof init?.body === "string" ? init.body : "");

    if (String(input).endsWith("/payments")) {
      return new Response(JSON.stringify({ status: "pending", amountCents: 299, pixCopyPaste: "000201FAKE", expiresAt: new Date(Date.now() + 600_000).toISOString() }), { status: 201 });
    }

    return new Response(JSON.stringify({ status: "open" }), { status: 201 });
  };
  t.ctx.gateway = createCoreGateway({ client: createClient({ baseUrl: "https://core.test", apiKey: "fk_teste", fetch: fetchFn, retries: 0 }) });

  const res = await postOrder();
  const id = res.json().id as string;
  const [row] = await t.db.select().from(orders).where(eq(orders.id, id));

  assert.equal(res.statusCode, 201);
  assert.equal(urls.length, 2);
  assert.ok(bodies.every((body) => !body.includes(id)));
  assert.ok(urls.every((url) => !url.includes(id)));
  assert.equal(urls[0], `https://core.test/v1/charges/${row.pixId}`);
  assert.notEqual(row.pixId, id);
});

test("os dois eventos do operador logam o pixId e nunca o id do pedido", async () => {
  const res = await postOrder();
  const id = res.json().id as string;
  const [row] = await t.db.select().from(orders).where(eq(orders.id, id));
  t.gateway.statuses.set(row.pixId, "PAID");

  await t.app.inject({ method: "GET", url: `/orders/${id}` });

  const created = logs.split(String.fromCharCode(10)).filter((line) => line.includes("Pedido pago sem imagem"));
  assert.equal(created.length, 1);
  assert.ok(created[0].includes(row.pixId));

  await t.db
    .update(orders)
    .set({ createdAt: new Date(Date.now() - 4 * 24 * 3600_000) })
    .where(eq(orders.id, id));
  logs = "";

  await cleanupOrders(t.ctx);

  const deleted = logs.split(String.fromCharCode(10)).filter((line) => line.includes("Pedido pago sem imagem apagado"));
  assert.equal(deleted.length, 1);
  assert.ok(deleted[0].includes(row.pixId));
  assert.ok(!logs.includes(id));
});
