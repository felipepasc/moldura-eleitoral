import assert from "node:assert/strict";
import { test } from "node:test";
import { canSubmit, initialCandidateId, previewFrameSrc } from "./frame-choice";

test("sem ?c= válido, nenhuma moldura vem escolhida (nada de pré-selecionar o primeiro candidato)", () => {
  assert.equal(initialCandidateId(undefined), "");
  assert.equal(initialCandidateId(""), "");
  assert.equal(initialCandidateId("neutral"), "");
  assert.equal(initialCandidateId("../lula"), "");
  assert.equal(initialCandidateId(["zema", "lula"]), "");
});

test("com ?c= válido, a moldura do candidato vem escolhida", () => {
  assert.equal(initialCandidateId("zema"), "zema");
  assert.equal(initialCandidateId("lula"), "lula");
});

test("a prévia usa a moldura neutra em tamanho cheio enquanto nada foi escolhido", () => {
  assert.equal(previewFrameSrc(""), "/frames/neutral.png");
  assert.equal(previewFrameSrc("zema"), "/frames/zema.png");
});

test("só dá para pagar com candidato escolhido, foto carregada e moldura pronta", () => {
  const ready = { candidateId: "zema", hasFile: true, hasImage: true, frameReady: true, busy: false };

  assert.equal(canSubmit(ready), true);
  assert.equal(canSubmit({ ...ready, candidateId: "" }), false);
  assert.equal(canSubmit({ ...ready, hasFile: false }), false);
  assert.equal(canSubmit({ ...ready, hasImage: false }), false);
  assert.equal(canSubmit({ ...ready, frameReady: false }), false);
  assert.equal(canSubmit({ ...ready, busy: true }), false);
});
