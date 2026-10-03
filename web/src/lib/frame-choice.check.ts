import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAME_LOAD_ERROR, canSubmit, frameFailed, frameLoaded, frameLoading, initialCandidateId, isFrameReady, payHint, previewFrameSrc } from "./frame-choice";

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

test("status da moldura: carregando, pronta e falha valem só para o candidato atual", () => {
  const loading = frameLoading("zema");

  assert.deepEqual(loading, { id: "zema", state: "loading" });
  assert.equal(isFrameReady(loading, "zema"), false);
  assert.equal(isFrameReady(frameLoaded("zema"), "zema"), true);
  assert.equal(isFrameReady(frameLoaded("zema"), "lula"), false);
  assert.equal(isFrameReady(frameFailed("zema"), "zema"), false);
});

const base = { candidateId: "zema", photoReady: false, ready: false };

test("dica: carregando, pronta, falha", () => {
  assert.equal(payHint({ ...base, frame: frameLoading("zema") }), "Carregando a moldura…");
  assert.equal(payHint({ ...base, frame: frameLoaded("zema") }), "Agora escolha a sua foto para continuar.");
  assert.equal(payHint({ ...base, frame: frameFailed("zema") }), FRAME_LOAD_ERROR);
  assert.equal(payHint({ ...base, ready: true, photoReady: true, frame: frameLoaded("zema") }), "Você paga por Pix e baixa a foto em seguida.");
});

test("falha da moldura continua visível depois de escolher a foto (o bug antigo dizia 'Carregando' para sempre)", () => {
  assert.equal(payHint({ ...base, photoReady: true, frame: frameFailed("zema") }), FRAME_LOAD_ERROR);
});

test("tentar de novo volta a carregando; status de outro candidato conta como carregando", () => {
  const retried = frameLoading("zema");

  assert.equal(payHint({ ...base, photoReady: true, frame: retried }), "Carregando a moldura…");
  assert.equal(payHint({ ...base, photoReady: true, frame: frameFailed("lula") }), "Carregando a moldura…");
});

test("dica sem candidato", () => {
  assert.equal(payHint({ candidateId: "", photoReady: false, ready: false, frame: frameLoaded("") }), "Escolha sua foto e a moldura para continuar.");
  assert.equal(payHint({ candidateId: "", photoReady: true, ready: false, frame: frameLoaded("") }), "Agora escolha a moldura para continuar.");
});
