import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CANDIDATES, PARTIES, candidatesBy, findCandidate } from "@moldura/common";
import { ART_IDS, EXAMPLE_FRAME_ID, HERO_ART, artSrc, contrastRatio, displayName, frameSrc, hasArt, readableText, swatch, withArt } from "./art";

test("hasArt e artSrc só reconhecem as ilustrações aprovadas", () => {
  assert.equal(hasArt("lula"), true);
  assert.equal(artSrc("lula"), "/art/lula.webp");
  assert.equal(hasArt("flavio-bolsonaro"), true);
  assert.equal(hasArt("zema"), false);
  assert.equal(hasArt("neutral"), false);
  assert.equal(artSrc("neutral"), null);
  assert.equal(hasArt("candidato-inexistente"), false);
  assert.equal(hasArt("../lula"), false);
  assert.equal(artSrc(""), null);
});

test("toda ilustração aprovada pertence a um candidato existente", () => {
  for (const id of ART_IDS) {
    assert.ok(CANDIDATES.some((candidate) => candidate.id === id), id);
  }
});

test("withArt mantém a ordem e só os candidatos com ilustração", () => {
  const ids = withArt(CANDIDATES).map((candidate) => candidate.id);

  assert.deepEqual(ids, CANDIDATES.map((candidate) => candidate.id).filter((id) => ART_IDS.includes(id)));
  assert.equal(ids.length, ART_IDS.length);
});

test("o site mostra só o 2º turno: 2 presidentes", () => {
  const presidents = candidatesBy("presidente");

  assert.equal(presidents.length, 2);
  assert.ok(presidents.every((candidate) => candidate.office === "presidente"));
});

test("displayName deixa o nome legível em caixa mista", () => {
  assert.equal(displayName("LULA"), "Lula");
  assert.equal(displayName("FLÁVIO BOLSONARO"), "Flávio Bolsonaro");
  assert.equal(displayName("CLARIANA BARÃO"), "Clariana Barão");
  assert.equal(displayName("JOÃO DA SILVA"), "João da Silva");
});

test("readableText garante contraste AA para o texto da faixa de partidos", () => {
  assert.equal(readableText("#ffffff"), "#0f172a");
  assert.equal(readableText("#000000"), "#ffffff");
  assert.equal(readableText("#ffc200"), "#0f172a");

  for (const party of PARTIES) {
    const colors = swatch(party.colors.primary);

    assert.ok(contrastRatio(colors.background, colors.text) >= 4.5, `${party.acronym} ${colors.background}`);
  }

  assert.deepEqual(swatch("#e20e28"), { background: "#e20e28", text: "#ffffff" });
  assert.deepEqual(swatch("lixo"), { background: "#475569", text: "#ffffff" });
});

test("toda ilustração de ART_IDS tem o arquivo public/art/<id>.webp e um candidato", () => {
  const artDir = fileURLToPath(new URL("../../public/art/", import.meta.url));

  for (const id of ART_IDS) {
    assert.ok(existsSync(join(artDir, `${id}.webp`)), `falta public/art/${id}.webp`);
    assert.ok(findCandidate(id), `candidato inexistente: ${id}`);
  }
});

test("frameSrc aponta para a moldura reduzida em WebP", () => {
  assert.equal(frameSrc("lula"), "/frames/lula.webp");
});

test("os dois candidatos têm ilustração (e a moldura neutra continua sem)", () => {
  for (const candidate of candidatesBy("presidente")) {
    assert.equal(hasArt(candidate.id), true, candidate.id);
  }

  assert.equal(ART_IDS.length, 2);
});

test("ilustrações do topo: 3 pessoas fictícias, arquivos existem e não são candidatos", () => {
  const artDir = fileURLToPath(new URL("../../public/art/", import.meta.url));

  assert.equal(HERO_ART.length, 3);

  for (const item of HERO_ART) {
    assert.match(item.src, /^\/art\/hero-[1-3]\.webp$/);
    assert.ok(existsSync(join(artDir, item.src.replace("/art/", ""))), item.src);
    assert.ok(!ART_IDS.includes(item.id), item.id);
    assert.equal(findCandidate(item.id), undefined);
    assert.equal(hasArt(item.id), false);
    assert.match(item.alt, /gerada por IA/);
  }
});

test("a moldura do topo é a de exemplo, que não é candidato", () => {
  assert.equal(EXAMPLE_FRAME_ID, "exemplo");
  assert.equal(frameSrc(EXAMPLE_FRAME_ID), "/frames/exemplo.webp");
  assert.equal(findCandidate(EXAMPLE_FRAME_ID), undefined);
});
