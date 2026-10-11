import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATES, CENTER_HOLE, CreateOrderSchema, FRAME_SIZE, FRAME_STYLES, findFrameStyle, frameFileName, frameHole, frameMaskFileName, frameStylesFor, OrderSchema, PARTIES, STATES, candidatesBy, findCandidate, findParty, innerRadius, placePhoto } from "./index";

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
  assert.equal(CANDIDATES.length, 2);
  assert.equal(findCandidate("zema"), undefined);
});

test("CreateOrderSchema aceita pedido válido", () => {
  const result = CreateOrderSchema.safeParse({ candidateId: "lula", framing: { zoom: 1.5, offsetX: 0, offsetY: 0 }, consent: "true" });

  assert.equal(result.success, true);
});

test("CreateOrderSchema exige o consentimento (consent = \"true\")", () => {
  const base = { candidateId: "flavio-bolsonaro", framing: { zoom: 1, offsetX: 0, offsetY: 0 } };

  assert.equal(CreateOrderSchema.safeParse(base).success, false);
  assert.equal(CreateOrderSchema.safeParse({ ...base, consent: "false" }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ ...base, consent: true }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ ...base, consent: "" }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ ...base, consent: "true" }).success, true);
});

test("CreateOrderSchema rejeita candidato desconhecido, zoom e deslocamento fora da faixa", () => {
  const valid = { zoom: 1, offsetX: 0, offsetY: 0 };

  assert.equal(CreateOrderSchema.safeParse({ candidateId: "x", framing: valid, consent: "true" }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "zema", framing: valid, consent: "true" }).success, false);
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

test("2º turno: só Lula (13) e Flávio Bolsonaro (22), ids e números únicos", () => {
  const presidents = candidatesBy("presidente");

  assert.equal(presidents.length, 2);
  assert.deepEqual(CANDIDATES.map((candidate) => candidate.id).sort(), ["flavio-bolsonaro", "lula"]);
  assert.equal(new Set(CANDIDATES.map((candidate) => candidate.id)).size, CANDIDATES.length);
  assert.equal(new Set(presidents.map((candidate) => candidate.number)).size, presidents.length);

  for (const candidate of CANDIDATES) {
    assert.match(candidate.number, /^[0-9]{2}$/);
    assert.ok(candidate.frameName.length > 0);
  }
});

test("os candidatos do 2º turno mantêm id, número e partido", () => {
  const expected: Record<string, string> = { lula: "13", "flavio-bolsonaro": "22" };

  assert.equal(findCandidate("lula")?.partyAcronym, "PT");
  assert.equal(findCandidate("flavio-bolsonaro")?.partyAcronym, "PL");

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
    // Só partido marcado como de duas cores (twoColor) pode repetir a cor em secondary e accent.
    if (party.twoColor) {
      assert.equal(secondary, accent, party.acronym);
    } else {
      assert.ok(distance(secondary, accent) >= 60, party.acronym);
    }
  }

  assert.deepEqual(PARTIES.filter((party) => party.twoColor).map((party) => party.acronym), ["MISSÃO"]);
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

test("OrderSchema: id é uuid e downloadUrl é URL http/https ou null", () => {
  const order = { id: "3f2b6c1e-8a4d-4c2b-9e1f-2a3b4c5d6e7f", status: "paid", candidateId: "lula", pix: null, downloadUrl: "https://files.exemplo.com.br/results/a.png?X-Amz-Signature=1" };

  assert.equal(OrderSchema.safeParse(order).success, true);
  assert.equal(OrderSchema.safeParse({ ...order, downloadUrl: "http://localhost:9300/b/results/a.png" }).success, true);
  assert.equal(OrderSchema.safeParse({ ...order, downloadUrl: null }).success, true);
  assert.equal(OrderSchema.safeParse({ ...order, id: "123" }).success, false);
  assert.equal(OrderSchema.safeParse({ ...order, id: "../admin" }).success, false);
  assert.equal(OrderSchema.safeParse({ ...order, downloadUrl: "javascript:alert(1)" }).success, false);
  assert.equal(OrderSchema.safeParse({ ...order, downloadUrl: "data:image/png;base64,AAA" }).success, false);
  assert.equal(OrderSchema.safeParse({ ...order, downloadUrl: "não é url" }).success, false);
});

test("FRAME_STYLES são modelos numerados; cada candidato tem os seus (Lula 6, Flávio 5)", () => {
  assert.deepEqual(FRAME_STYLES.map((style) => style.id), ["modelo-1", "modelo-2", "modelo-3", "modelo-4", "modelo-5", "modelo-6"]);
  assert.deepEqual(FRAME_STYLES.map((style) => style.name), ["Modelo 1", "Modelo 2", "Modelo 3", "Modelo 4", "Modelo 5", "Modelo 6"]);
  assert.equal(frameStylesFor("lula").length, 6);
  assert.equal(frameStylesFor("flavio-bolsonaro").length, 5);
  assert.deepEqual(frameStylesFor("ninguem"), []);

  for (const candidate of CANDIDATES) {
    assert.ok(frameStylesFor(candidate.id).length > 0, candidate.id);
  }
});

test("findFrameStyle acha por id e, com candidato, só os modelos que ele tem; estilos antigos não existem mais", () => {
  assert.equal(findFrameStyle("modelo-2")?.name, "Modelo 2");
  assert.equal(findFrameStyle("modelo-6", "lula")?.id, "modelo-6");
  assert.equal(findFrameStyle("modelo-6", "flavio-bolsonaro"), undefined);
  assert.equal(findFrameStyle("modelo-1", "ninguem"), undefined);

  for (const old of ["classica", "faixa", "estrela", "partido", "xyz"]) {
    assert.equal(findFrameStyle(old), undefined, old);
  }
});

test("frameFileName: o primeiro modelo usa <candidato>.png e os demais usam --; a máscara fica em masks/", () => {
  assert.equal(frameFileName("lula", "modelo-1"), "lula.png");
  assert.equal(frameFileName("flavio-bolsonaro", "modelo-2"), "flavio-bolsonaro--modelo-2.png");
  assert.equal(frameMaskFileName("lula", "modelo-1"), "masks/lula.png");
  assert.equal(frameMaskFileName("lula", "modelo-6"), "masks/lula--modelo-6.png");
});

test("frameHole: toda moldura tem furo perto do meio da imagem; modelo que o candidato não tem não tem furo", () => {
  for (const candidate of CANDIDATES) {
    for (const style of frameStylesFor(candidate.id)) {
      const hole = frameHole(candidate.id, style.id);

      assert.ok(hole, `${candidate.id} ${style.id}`);
      assert.ok(hole.r > 0.3 && hole.r < 0.5);
      assert.ok(Math.abs(hole.cx - 0.5) < 0.05);
      assert.ok(hole.cy > 0.3 && hole.cy <= 0.5);
    }
  }

  assert.equal(frameHole("flavio-bolsonaro", "modelo-6"), undefined);
  assert.equal(frameHole("ninguem", "modelo-1"), undefined);
});

test("placePhoto com furo: a foto cobre o quadrado do furo e fica centrada nele", () => {
  const hole = { cx: 0.5, cy: 0.4, r: 0.39 };
  const wide = placePhoto({ imageWidth: 2000, imageHeight: 1000, zoom: 1, offsetX: 0, offsetY: 0, hole });

  assert.ok(Math.abs(wide.height - 0.78 * FRAME_SIZE) < 1e-6);
  assert.ok(Math.abs(wide.top + wide.height / 2 - 0.4 * FRAME_SIZE) < 1e-6);
  assert.ok(Math.abs(wide.left + wide.width / 2 - 0.5 * FRAME_SIZE) < 1e-6);
  assert.ok(wide.left <= (hole.cx - hole.r) * FRAME_SIZE && wide.left + wide.width >= (hole.cx + hole.r) * FRAME_SIZE);

  const moved = placePhoto({ imageWidth: 1000, imageHeight: 1000, zoom: 2, offsetX: 0.1, offsetY: -0.1, hole, size: 540 });

  assert.ok(Math.abs(moved.width - 0.78 * 540 * 2) < 1e-6);
  assert.ok(Math.abs(moved.left + moved.width / 2 - (0.5 + 0.1) * 540) < 1e-6);
  assert.ok(Math.abs(moved.top + moved.height / 2 - (0.4 - 0.1) * 540) < 1e-6);
});

test("placePhoto sem furo usa o círculo central das molduras geradas", () => {
  const placement = placePhoto({ imageWidth: 1000, imageHeight: 1000, zoom: 1, offsetX: 0, offsetY: 0 });

  assert.ok(Math.abs(placement.width - innerRadius(FRAME_SIZE) * 2) < 1e-6);
  assert.ok(Math.abs(placement.left + placement.width / 2 - FRAME_SIZE / 2) < 1e-6);
  assert.ok(Math.abs(CENTER_HOLE.r * FRAME_SIZE - innerRadius(FRAME_SIZE)) < 1e-6);
});

test("CreateOrderSchema: frameStyle é opcional (padrão modelo-1) e rejeita estilo desconhecido", () => {
  const base = { candidateId: "lula", framing: { zoom: 1, offsetX: 0, offsetY: 0 }, consent: "true" };

  assert.equal(CreateOrderSchema.parse(base).frameStyle, "modelo-1");
  assert.equal(CreateOrderSchema.parse({ ...base, frameStyle: "modelo-4" }).frameStyle, "modelo-4");
  assert.equal(CreateOrderSchema.safeParse({ ...base, frameStyle: "neon" }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ ...base, frameStyle: "classica" }).success, false);
});
