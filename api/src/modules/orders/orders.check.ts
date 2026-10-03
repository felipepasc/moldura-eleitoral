import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.close();
});

async function photo() {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
}

async function multipart(fields: Record<string, string>, file?: { data: Buffer; type: string }) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  if (file) {
    form.append("photo", new Blob([new Uint8Array(file.data)], { type: file.type }), "foto.jpg");
  }

  const request = new Request("http://localhost", { method: "POST", body: form });

  return {
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  };
}

const FRAMING = JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 });

async function postOrder(fields: Record<string, string>, file?: { data: Buffer; type: string }) {
  const body = await multipart(fields, file);

  return t.app.inject({ method: "POST", url: "/orders", ...body });
}

test("POST /orders cria pedido pending com Pix de 399 centavos e guarda a foto", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" });
  const body = res.json();

  assert.equal(res.statusCode, 201);
  assert.equal(body.status, "pending");
  assert.equal(body.candidateId, "lula");
  assert.ok(body.pix.brCode.startsWith("000201-"));
  assert.equal(body.downloadUrl, null);
  assert.equal(t.gateway.inputs[0].amountCents, 399);
  assert.equal(t.gateway.inputs[0].expiresInSeconds, 1800);
  assert.equal(t.storage.files.size, 1);
  assert.ok([...t.storage.files.keys()][0].startsWith("photos/"));
});

test("POST /orders rejeita candidato inválido, framing inválido e falta de foto", async () => {
  const file = { data: await photo(), type: "image/jpeg" };

  assert.equal((await postOrder({ candidateId: "x", framing: FRAMING }, file)).statusCode, 400);
  assert.equal((await postOrder({ candidateId: "lula", framing: "nao-json" }, file)).statusCode, 400);
  assert.equal((await postOrder({ candidateId: "lula", framing: JSON.stringify({ zoom: 9, offsetX: 0, offsetY: 0 }) }, file)).statusCode, 400);
  assert.equal((await postOrder({ candidateId: "lula", framing: FRAMING })).statusCode, 400);
  assert.equal(t.storage.files.size, 0);
});

test("POST /orders com arquivo que não é imagem (mas diz image/jpeg) devolve 400", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: Buffer.from("isto nao e imagem"), type: "image/jpeg" });

  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /foto/i);
  assert.equal(t.storage.files.size, 0);
  assert.equal(t.gateway.created.length, 0);
});

test("POST /orders rejeita tipo de arquivo que não é imagem permitida", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "application/pdf" });

  assert.equal(res.statusCode, 400);
  assert.equal(t.storage.files.size, 0);
});

test("POST /orders com foto acima de 8 MB devolve 413 e não grava nada", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: Buffer.alloc(9 * 1024 * 1024, 1), type: "image/jpeg" });

  assert.equal(res.statusCode, 413);
  assert.equal(t.storage.files.size, 0);
});

test("POST /orders com a AbacatePay fora do ar devolve 502 e não deixa foto órfã", async () => {
  t.gateway.failCreate = true;

  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" });

  assert.equal(res.statusCode, 502);
  assert.equal(t.storage.files.size, 0);
});

test("GET /orders/:id com id desconhecido ou que não é uuid devolve 404", async () => {
  const unknown = await t.app.inject({ method: "GET", url: "/orders/6b1f9a52-5a43-4d52-8d52-0a8f2f0a0000" });
  const notUuid = await t.app.inject({ method: "GET", url: "/orders/abc" });

  assert.equal(unknown.statusCode, 404);
  assert.equal(notUuid.statusCode, 404);
});

test("GET /orders/:id pendente mostra o Pix; quando a AbacatePay diz PAID monta a imagem e libera o download", async () => {
  const created = (await postOrder({ candidateId: "flavio-bolsonaro", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();

  const pending = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(pending.status, "pending");
  assert.ok(pending.pix);

  t.gateway.statuses.set(t.gateway.created[0], "PAID");

  const paid = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(paid.status, "paid");
  assert.equal(paid.pix, null);
  assert.ok(paid.downloadUrl.startsWith("memory://results/"));

  const resultKey = [...t.storage.files.keys()].find((key) => key.startsWith("results/"));
  assert.ok(resultKey);
  const meta = await sharp(t.storage.files.get(resultKey)).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);

  assert.equal([...t.storage.files.keys()].some((key) => key.startsWith("photos/")), false, "foto original deve ser apagada");
});

test("GET /orders/:id marca expired quando a AbacatePay diz EXPIRED ou quando passou do prazo local", async () => {
  const a = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "EXPIRED");
  assert.equal((await t.app.inject({ method: "GET", url: `/orders/${a.id}` })).json().status, "expired");

  const later = await createTestApp({ now: () => new Date(Date.now() + 3600_000) });

  try {
    const b = (await later.app.inject({ method: "POST", url: "/orders", ...(await multipart({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })) })).json();
    assert.equal((await later.app.inject({ method: "GET", url: `/orders/${b.id}` })).json().status, "expired");
  } finally {
    await later.close();
  }
});

test("GET /orders/:id com a AbacatePay fora do ar devolve o estado local", async () => {
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.failCheck = true;

  const res = await t.app.inject({ method: "GET", url: `/orders/${created.id}` });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "pending");
});

test("falha na montagem vira paid_failed e a remontagem funciona depois", async () => {
  t.ctx.framesDir = "C:/pasta/que/nao/existe";
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "PAID");

  const failed = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(failed.status, "paid_failed");
  assert.equal(failed.downloadUrl, null);

  t.ctx.framesDir = (await import("node:path")).resolve("assets/frames");

  const fixed = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(fixed.status, "paid");
  assert.ok(fixed.downloadUrl);
});

test("confirmar duas vezes gera uma só imagem", async () => {
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "PAID");

  await t.app.inject({ method: "GET", url: `/orders/${created.id}` });
  await t.app.inject({ method: "GET", url: `/orders/${created.id}` });

  const results = t.storage.puts.filter((key) => key.startsWith("results/"));
  assert.equal(results.length, 1);

  const [row] = await t.db.select().from(orders).where(eq(orders.id, created.id));
  assert.equal(row.status, "paid");
  assert.equal(row.photoKey, null);
});

test("POST /orders respeita o limite por IP", async () => {
  const limited = await createTestApp({ ordersPerMinute: 2 });

  try {
    const file = { data: await photo(), type: "image/jpeg" };
    const send = async () => limited.app.inject({ method: "POST", url: "/orders", ...(await multipart({ candidateId: "lula", framing: FRAMING }, file)) });

    assert.equal((await send()).statusCode, 201);
    assert.equal((await send()).statusCode, 201);
    const blocked = await send();

    assert.equal(blocked.statusCode, 429);
    assert.deepEqual(blocked.json(), { error: "Muitas tentativas. Aguarde um instante e tente de novo." });
  } finally {
    await limited.close();
  }
});

test("respostas JSON não expõem campos internos em nenhum estado", async () => {
  const forbidden = ["photoKey", "resultKey", "pixId", "ipAddress", "framing", "photos/", "results/"];
  const bodies: string[] = [];

  const createdRes = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" });
  const created = createdRes.json();
  bodies.push(createdRes.body);
  bodies.push((await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).body);

  t.gateway.statuses.set(t.gateway.created[0], "PAID");
  bodies.push((await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).body);

  for (const body of bodies) {
    const { downloadUrl: _downloadUrl, ...rest } = JSON.parse(body);
    const text = JSON.stringify(rest);

    for (const word of forbidden) {
      assert.equal(text.includes(word), false, `resposta não deve conter ${word}`);
    }

    assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ["candidateId", "downloadUrl", "id", "pix", "status"]);
  }
});

test("falha ao gravar o pedido depois do Pix não deixa foto órfã e não vaza dados no log", async () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logged = await createTestApp({ logStream: stream });

  try {
    logged.gateway.nextId = "pix_fixo";
    const file = { data: await photo(), type: "image/jpeg" };
    const send = async () => logged.app.inject({ method: "POST", url: "/orders", remoteAddress: "203.0.113.9", ...(await multipart({ candidateId: "lula", framing: FRAMING }, file)) });

    assert.equal((await send()).statusCode, 201);
    const second = await send();

    assert.equal(second.statusCode, 500);
    assert.equal(logged.storage.files.size, 1, "só a foto do primeiro pedido pode ficar");

    const text = lines.join("");
    assert.ok(text.includes("Erro não tratado"), "o erro deve ter sido logado");

    for (const secret of ["203.0.113.9", "000201-", "QUJD", "photos/", "pix_fixo", "Failed query"]) {
      assert.equal(text.includes(secret), false, `log não deve conter ${secret}`);
    }
  } finally {
    await logged.close();
  }
});

test("POST /orders com falha da AbacatePay e do storage.remove ainda devolve 502", async () => {
  t.gateway.failCreate = true;
  t.storage.remove = async () => {
    throw new Error("storage fora do ar");
  };

  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" });

  assert.equal(res.statusCode, 502);
});

test("pago na AbacatePay vence a expiração local", async () => {
  const later = await createTestApp({ now: () => new Date(Date.now() + 3600_000) });

  try {
    const created = (await later.app.inject({ method: "POST", url: "/orders", ...(await multipart({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })) })).json();
    later.gateway.statuses.set(later.gateway.created[0], "PAID");

    assert.equal((await later.app.inject({ method: "GET", url: `/orders/${created.id}` })).json().status, "paid");
  } finally {
    await later.close();
  }
});

test("pedido já expirado que depois aparece como PAID vira paid", async () => {
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "EXPIRED");
  assert.equal((await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json().status, "expired");

  t.gateway.statuses.set(t.gateway.created[0], "PAID");
  const paid = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();

  assert.equal(paid.status, "paid");
  assert.ok(paid.downloadUrl);
});

test("paid_failed não é rebaixado para expired por consulta que não vê PAID", async () => {
  const later = await createTestApp({ now: () => new Date(Date.now() + 3600_000), framesDir: "C:/pasta/que/nao/existe" });

  try {
    const created = (await later.app.inject({ method: "POST", url: "/orders", ...(await multipart({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })) })).json();
    later.gateway.statuses.set(later.gateway.created[0], "PAID");
    assert.equal((await later.app.inject({ method: "GET", url: `/orders/${created.id}` })).json().status, "paid_failed");

    later.gateway.statuses.set(later.gateway.created[0], "EXPIRED");

    assert.equal((await later.app.inject({ method: "GET", url: `/orders/${created.id}` })).json().status, "paid_failed");
  } finally {
    await later.close();
  }
});

test("paid_failed é remontado mesmo com a AbacatePay fora do ar", async () => {
  t.ctx.framesDir = "C:/pasta/que/nao/existe";
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "PAID");
  assert.equal((await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json().status, "paid_failed");

  t.gateway.failCheck = true;
  t.ctx.framesDir = (await import("node:path")).resolve("assets/frames");

  assert.equal((await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json().status, "paid");
});

test("rota inexistente devolve 404 genérico sem eco da URL", async () => {
  const res = await t.app.inject({ method: "GET", url: "/nao-existe?segredo=abc" });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: "Não encontrado." });
});
