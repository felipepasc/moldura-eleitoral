import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATES, CreateOrderSchema, FRAME_SIZE, findCandidate, innerRadius, placePhoto } from "./index";

test("innerRadius deixa 13% de anel de cada lado", () => {
  assert.equal(innerRadius(FRAME_SIZE), 540 - 140.4);
});

test("placePhoto cobre o círculo com foto quadrada", () => {
  const placement = placePhoto({ imageWidth: 1000, imageHeight: 1000, zoom: 1, offsetX: 0, offsetY: 0 });

  assert.ok(Math.abs(placement.width - 799.2) < 0.001);
  assert.ok(Math.abs(placement.left - 140.4) < 0.001);
});

test("placePhoto usa o menor lado para cobrir quando a foto é larga", () => {
  const placement = placePhoto({ imageWidth: 2000, imageHeight: 1000, zoom: 1, offsetX: 0, offsetY: 0 });

  assert.ok(Math.abs(placement.height - 799.2) < 0.001);
  assert.ok(Math.abs(placement.width - 1598.4) < 0.001);
});

test("placePhoto aplica zoom e deslocamento como fração do quadro", () => {
  const placement = placePhoto({ imageWidth: 1000, imageHeight: 1000, zoom: 2, offsetX: 0.1, offsetY: -0.1 });

  assert.ok(Math.abs(placement.width - 1598.4) < 0.001);
  assert.ok(Math.abs(placement.left - (540 - 799.2 + 108)) < 0.001);
  assert.ok(Math.abs(placement.top - (540 - 799.2 - 108)) < 0.001);
});

test("findCandidate acha por id e devolve undefined para desconhecido", () => {
  assert.equal(findCandidate("lula")?.number, "13");
  assert.equal(findCandidate("ninguem"), undefined);
  assert.equal(CANDIDATES.length, 6);
});

test("CreateOrderSchema aceita pedido válido", () => {
  const result = CreateOrderSchema.safeParse({ candidateId: "lula", framing: { zoom: 1.5, offsetX: 0, offsetY: 0 } });

  assert.equal(result.success, true);
});

test("CreateOrderSchema rejeita candidato desconhecido, zoom e deslocamento fora da faixa", () => {
  const valid = { zoom: 1, offsetX: 0, offsetY: 0 };

  assert.equal(CreateOrderSchema.safeParse({ candidateId: "x", framing: valid }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, zoom: 0.5 } }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, zoom: 4 } }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, offsetX: 2 } }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, offsetY: Number.NaN } }).success, false);
});
