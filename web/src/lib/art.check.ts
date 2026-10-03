import assert from "node:assert/strict";
import { test } from "node:test";
import { CANDIDATES, PARTIES, STATES } from "@moldura/common";
import { ART_IDS, artSrc, contrastRatio, displayName, filterCandidates, hasArt, readableText, swatch, withArt } from "./art";

test("hasArt e artSrc só reconhecem as ilustrações aprovadas", () => {
  assert.equal(hasArt("lula"), true);
  assert.equal(artSrc("lula"), "/art/lula.webp");
  assert.equal(hasArt("wilson-grassi"), false);
  assert.equal(artSrc("wilson-grassi"), null);
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

test("filterCandidates separa por cargo e estado", () => {
  assert.equal(filterCandidates("presidente").length, 12);
  assert.ok(filterCandidates("presidente").every((candidate) => candidate.office === "presidente"));
  assert.deepEqual(filterCandidates("governador"), []);
  assert.deepEqual(filterCandidates("governador", ""), []);

  for (const state of STATES) {
    assert.ok(filterCandidates("governador", state.code).every((candidate) => candidate.office === "governador" && candidate.state === state.code));
  }
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
