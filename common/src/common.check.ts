import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATES, CreateOrderSchema, FRAME_SIZE, PARTIES, STATES, candidatesBy, findCandidate, findParty, innerRadius, placePhoto } from "./index";

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
  assert.equal(CANDIDATES.length, 12);
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

const HEX = /^#[0-9a-f]{6}$/i;

function distance(a: string, b: string): number {
  const channels = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);

  return Math.hypot(ar - br, ag - bg, ab - bb);
}

test("há 12 presidentes com ids únicos e números únicos por cargo", () => {
  const presidents = candidatesBy("presidente");

  assert.equal(presidents.length, 12);
  assert.equal(new Set(CANDIDATES.map((candidate) => candidate.id)).size, CANDIDATES.length);
  assert.equal(new Set(presidents.map((candidate) => candidate.number)).size, presidents.length);

  for (const candidate of CANDIDATES) {
    assert.match(candidate.number, /^[0-9]{2}$/);
    assert.ok(candidate.frameName.length > 0);
  }
});

test("os seis candidatos originais mantêm id e número", () => {
  const expected: Record<string, string> = { lula: "13", "flavio-bolsonaro": "22", "ronaldo-caiado": "55", zema: "30", samara: "80", "augusto-cury": "70" };

  for (const [id, number] of Object.entries(expected)) {
    assert.equal(findCandidate(id)?.number, number);
  }
});

test("todo candidato tem partido existente e cores válidas derivadas do partido", () => {
  for (const candidate of CANDIDATES) {
    const party = findParty(candidate.partyAcronym);

    assert.ok(party, candidate.id);
    assert.deepEqual(candidate.colors, [party.colors.primary, party.colors.secondary, party.colors.accent]);
  }
});

test("partidos: siglas e números únicos, hex válidos e contraste mínimo entre as três cores", () => {
  assert.equal(PARTIES.length, 29);
  assert.equal(new Set(PARTIES.map((party) => party.acronym)).size, PARTIES.length);
  assert.equal(new Set(PARTIES.map((party) => party.number)).size, PARTIES.length);

  for (const party of PARTIES) {
    const { primary, secondary, accent } = party.colors;

    for (const color of [primary, secondary, accent]) {
      assert.match(color, HEX, party.acronym);
    }

    assert.ok(distance(primary, secondary) >= 60, party.acronym);
    assert.ok(distance(primary, accent) >= 60, party.acronym);
    // Partido de duas cores (ex.: Missão, amarelo e preto) repete a mesma cor em secondary e accent.
    assert.ok(secondary === accent || distance(secondary, accent) >= 60, party.acronym);
  }
});

test("findParty acha por sigla e os nomes novos estão corretos", () => {
  assert.equal(findParty("PT")?.number, "13");
  assert.equal(findParty("DEMOCRATA")?.number, "35");
  assert.equal(findParty("MOBILIZA")?.number, "33");
  assert.equal(findParty("UNIÃO")?.number, "44");
  assert.equal(findParty("PP")?.number, "11");
  assert.equal(findParty("PV")?.colorsEstimated, true);
  assert.equal(findParty("XYZ"), undefined);
});

test("27 estados e nenhum governador cadastrado ainda", () => {
  assert.equal(STATES.length, 27);
  assert.equal(new Set(STATES.map((state) => state.code)).size, 27);
  assert.deepEqual(candidatesBy("governador"), []);
  assert.deepEqual(candidatesBy("governador", "SP"), []);
});
