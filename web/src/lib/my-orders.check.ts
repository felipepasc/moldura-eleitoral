import assert from "node:assert/strict";
import { test } from "node:test";
import { MY_ORDERS_KEY, MY_ORDERS_MAX, MY_ORDERS_TTL_MS, clearSavedOrders, loadSavedOrders, removeSavedOrder, saveOrder } from "./my-orders";
import type { KeyValueStorage } from "./my-orders";

const NOW = 1_800_000_000_000;
const ID_A = "3f2b8c1e-5d4a-4b7e-9c1a-0a1b2c3d4e5f";
const ID_B = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

function fakeStorage(initial?: string): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();

  if (initial !== undefined) {
    data.set(MY_ORDERS_KEY, initial);
  }

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

test("a chave é exatamente moldura:orders:v1 e o TTL é de 7 dias", () => {
  assert.equal(MY_ORDERS_KEY, "moldura:orders:v1");
  assert.equal(MY_ORDERS_TTL_MS, 7 * 24 * 3600 * 1000);
  assert.equal(MY_ORDERS_MAX, 20);
});

test("entrada válida é lida", () => {
  const storage = fakeStorage(JSON.stringify([{ id: ID_A, candidateId: "lula", savedAt: NOW - 1000 }]));

  assert.deepEqual(loadSavedOrders(storage, NOW), [{ id: ID_A, candidateId: "lula", savedAt: NOW - 1000 }]);
});

test("JSON corrompido devolve [] e remove a chave", () => {
  const storage = fakeStorage("{não é json");

  assert.deepEqual(loadSavedOrders(storage, NOW), []);
  assert.equal(storage.data.has(MY_ORDERS_KEY), false);
});

test("JSON que não é lista devolve [] e remove a chave", () => {
  const storage = fakeStorage(JSON.stringify({ id: ID_A }));

  assert.deepEqual(loadSavedOrders(storage, NOW), []);
  assert.equal(storage.data.has(MY_ORDERS_KEY), false);
});

test("entradas inválidas são descartadas e o armazenamento é regravado", () => {
  const good = { id: ID_A, candidateId: "lula", savedAt: NOW - 1000 };
  const storage = fakeStorage(
    JSON.stringify([
      good,
      { id: "abc", candidateId: "lula", savedAt: NOW },
      { id: ID_B, candidateId: "ninguem", savedAt: NOW },
      { id: uuid(1), candidateId: "lula", savedAt: String(NOW) },
      { id: uuid(2), candidateId: "lula", savedAt: null },
      { id: uuid(3), candidateId: "lula", savedAt: NOW + 10 * 60 * 1000 },
      { id: uuid(4), candidateId: "lula", savedAt: NOW - MY_ORDERS_TTL_MS },
      { id: uuid(5), candidateId: "lula", savedAt: NOW - MY_ORDERS_TTL_MS - 1 },
      null,
      "texto",
    ]),
  );

  assert.deepEqual(loadSavedOrders(storage, NOW), [good]);
  assert.deepEqual(JSON.parse(storage.data.get(MY_ORDERS_KEY) ?? "null"), [good]);
});

test("mesmo id duas vezes vira uma só", () => {
  const storage = fakeStorage(
    JSON.stringify([
      { id: ID_A, candidateId: "lula", savedAt: NOW - 5000 },
      { id: ID_A, candidateId: "lula", savedAt: NOW - 1000 },
    ]),
  );

  assert.equal(loadSavedOrders(storage, NOW).length, 1);
});

test("ordena do mais novo para o mais antigo", () => {
  const storage = fakeStorage(
    JSON.stringify([
      { id: ID_A, candidateId: "lula", savedAt: NOW - 5000 },
      { id: ID_B, candidateId: "zema", savedAt: NOW - 1000 },
    ]),
  );

  assert.deepEqual(loadSavedOrders(storage, NOW).map((order) => order.id), [ID_B, ID_A]);
});

test("25 salvos ficam 20 (os mais novos)", () => {
  const storage = fakeStorage();

  for (let i = 1; i <= 25; i += 1) {
    saveOrder(storage, { id: uuid(i), candidateId: "lula" }, NOW + i);
  }

  const list = loadSavedOrders(storage, NOW + 100);

  assert.equal(list.length, 20);
  assert.equal(list[0].id, uuid(25));
  assert.equal(list[19].id, uuid(6));
});

test("25 entradas gravadas à mão também são cortadas em 20", () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({ id: uuid(i + 1), candidateId: "lula", savedAt: NOW - i * 1000 }));
  const storage = fakeStorage(JSON.stringify(entries));

  assert.equal(loadSavedOrders(storage, NOW).length, 20);
  assert.equal(JSON.parse(storage.data.get(MY_ORDERS_KEY) ?? "[]").length, 20);
});

test("saveOrder não duplica nem renova o savedAt", () => {
  const storage = fakeStorage();

  saveOrder(storage, { id: ID_A, candidateId: "lula" }, NOW);
  saveOrder(storage, { id: ID_A, candidateId: "lula" }, NOW + 5000);

  assert.deepEqual(loadSavedOrders(storage, NOW + 5000), [{ id: ID_A, candidateId: "lula", savedAt: NOW }]);
});

test("saveOrder ignora id inválido ou candidato desconhecido", () => {
  const storage = fakeStorage();

  saveOrder(storage, { id: "x", candidateId: "lula" }, NOW);
  saveOrder(storage, { id: ID_A, candidateId: "ninguem" }, NOW);

  assert.deepEqual(loadSavedOrders(storage, NOW), []);
});

test("o valor gravado tem somente id, candidateId e savedAt", () => {
  const storage = fakeStorage();
  const extra = { id: ID_A, candidateId: "lula", downloadUrl: "http://x/y.png", pix: { brCode: "000201" } };

  saveOrder(storage, extra, NOW);

  const raw = storage.data.get(MY_ORDERS_KEY) ?? "";
  const parsed = JSON.parse(raw) as Record<string, unknown>[];

  assert.deepEqual(Object.keys(parsed[0]).sort(), ["candidateId", "id", "savedAt"]);
  assert.equal(raw.includes("downloadUrl"), false);
  assert.equal(raw.includes("pix"), false);
  assert.equal(raw.includes("000201"), false);
});

test("campos extras já gravados são removidos ao ler", () => {
  const storage = fakeStorage(JSON.stringify([{ id: ID_A, candidateId: "lula", savedAt: NOW, downloadUrl: "http://x" }]));

  assert.deepEqual(loadSavedOrders(storage, NOW), [{ id: ID_A, candidateId: "lula", savedAt: NOW }]);
  assert.equal((storage.data.get(MY_ORDERS_KEY) ?? "").includes("downloadUrl"), false);
});

test("storage que lança em getItem/setItem/removeItem não propaga exceção", () => {
  const boom = (): never => {
    throw new Error("QuotaExceededError");
  };
  const broken: KeyValueStorage = { getItem: boom, setItem: boom, removeItem: boom };

  assert.deepEqual(loadSavedOrders(broken, NOW), []);
  assert.doesNotThrow(() => saveOrder(broken, { id: ID_A, candidateId: "lula" }, NOW));
  assert.doesNotThrow(() => removeSavedOrder(broken, ID_A, NOW));
  assert.doesNotThrow(() => clearSavedOrders(broken));
});

test("setItem que lança cota não propaga exceção", () => {
  const storage = fakeStorage();
  const full: KeyValueStorage = {
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };

  assert.doesNotThrow(() => saveOrder(full, { id: ID_A, candidateId: "lula" }, NOW));
});

test("storage null: lista vazia e operações viram no-op", () => {
  assert.deepEqual(loadSavedOrders(null, NOW), []);
  assert.doesNotThrow(() => saveOrder(null, { id: ID_A, candidateId: "lula" }, NOW));
  assert.doesNotThrow(() => removeSavedOrder(null, ID_A, NOW));
  assert.doesNotThrow(() => clearSavedOrders(null));
});

test("removeSavedOrder remove só o id pedido", () => {
  const storage = fakeStorage();

  saveOrder(storage, { id: ID_A, candidateId: "lula" }, NOW);
  saveOrder(storage, { id: ID_B, candidateId: "zema" }, NOW + 1);
  removeSavedOrder(storage, ID_A, NOW + 2);

  assert.deepEqual(loadSavedOrders(storage, NOW + 2).map((order) => order.id), [ID_B]);
});

test("clearSavedOrders apaga a chave", () => {
  const storage = fakeStorage();

  saveOrder(storage, { id: ID_A, candidateId: "lula" }, NOW);
  clearSavedOrders(storage);

  assert.equal(storage.data.has(MY_ORDERS_KEY), false);
});
