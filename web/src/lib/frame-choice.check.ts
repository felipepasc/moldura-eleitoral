import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FRAME_LOAD_ERROR, availableFrameStyles, canSubmit, frameKey, frameThumbSrc, initialFrameStyle, resolveFrameStyle, frameFailed, frameLoaded, frameLoading, initialCandidateId, isFrameReady, payHint, previewFrameSrc } from "./frame-choice";

test("sem ?c= válido, nenhuma moldura vem escolhida (nada de pré-selecionar o primeiro candidato)", () => {
  assert.equal(initialCandidateId(undefined), "");
  assert.equal(initialCandidateId(""), "");
  assert.equal(initialCandidateId("neutral"), "");
  assert.equal(initialCandidateId("../lula"), "");
  assert.equal(initialCandidateId(["flavio-bolsonaro", "lula"]), "");
});

test("com ?c= válido, a moldura do candidato vem escolhida", () => {
  assert.equal(initialCandidateId("flavio-bolsonaro"), "flavio-bolsonaro");
  assert.equal(initialCandidateId("lula"), "lula");
});

test("a prévia usa a moldura neutra em tamanho cheio enquanto nada foi escolhido", () => {
  assert.equal(previewFrameSrc(""), "/frames/neutral.png");
  assert.equal(previewFrameSrc("flavio-bolsonaro"), "/frames/flavio-bolsonaro.png");
});

test("só dá para pagar com candidato escolhido, foto carregada e moldura pronta", () => {
  const ready = { candidateId: "flavio-bolsonaro", hasFile: true, hasImage: true, frameReady: true, busy: false, consent: true, adult: true, salesOpen: true };

  assert.equal(canSubmit(ready), true);
  assert.equal(canSubmit({ ...ready, candidateId: "" }), false);
  assert.equal(canSubmit({ ...ready, hasFile: false }), false);
  assert.equal(canSubmit({ ...ready, hasImage: false }), false);
  assert.equal(canSubmit({ ...ready, frameReady: false }), false);
  assert.equal(canSubmit({ ...ready, busy: true }), false);
});

test("pagar exige as duas confirmações (consentimento e idade) e vendas abertas", () => {
  const ready = { candidateId: "lula", hasFile: true, hasImage: true, frameReady: true, busy: false, consent: true, adult: true, salesOpen: true };

  assert.equal(canSubmit(ready), true);
  assert.equal(canSubmit({ ...ready, consent: false }), false);
  assert.equal(canSubmit({ ...ready, adult: false }), false);
  assert.equal(canSubmit({ ...ready, consent: false, adult: false }), false);
  assert.equal(canSubmit({ ...ready, salesOpen: false }), false);
});

test("dica: faltam as confirmações; vendas fechadas", () => {
  const frame = frameLoaded("lula");
  const ready = { candidateId: "lula", photoReady: true, ready: false, frame };

  assert.equal(payHint({ ...ready, confirmed: false }), "Marque as duas confirmações acima para continuar.");
  assert.equal(payHint({ ...ready, confirmed: true, salesOpen: false }), "As vendas estão fechadas no momento.");
  assert.equal(payHint({ candidateId: "", photoReady: false, ready: false, frame, salesOpen: false }), "As vendas estão fechadas no momento.");
});

test("status da moldura: carregando, pronta e falha valem só para o candidato atual", () => {
  const loading = frameLoading("flavio-bolsonaro");

  assert.deepEqual(loading, { id: "flavio-bolsonaro", state: "loading" });
  assert.equal(isFrameReady(loading, "flavio-bolsonaro"), false);
  assert.equal(isFrameReady(frameLoaded("flavio-bolsonaro"), "flavio-bolsonaro"), true);
  assert.equal(isFrameReady(frameLoaded("flavio-bolsonaro"), "lula"), false);
  assert.equal(isFrameReady(frameFailed("flavio-bolsonaro"), "flavio-bolsonaro"), false);
});

const base = { candidateId: "flavio-bolsonaro", photoReady: false, ready: false };

test("dica: carregando, pronta, falha", () => {
  assert.equal(payHint({ ...base, frame: frameLoading("flavio-bolsonaro") }), "Carregando a moldura…");
  assert.equal(payHint({ ...base, frame: frameLoaded("flavio-bolsonaro") }), "Agora escolha a sua foto para continuar.");
  assert.equal(payHint({ ...base, frame: frameFailed("flavio-bolsonaro") }), FRAME_LOAD_ERROR);
  assert.equal(payHint({ ...base, ready: true, photoReady: true, frame: frameLoaded("flavio-bolsonaro") }), "Você paga por Pix e baixa a foto em seguida.");
});

test("falha da moldura continua visível depois de escolher a foto (o bug antigo dizia 'Carregando' para sempre)", () => {
  assert.equal(payHint({ ...base, photoReady: true, frame: frameFailed("flavio-bolsonaro") }), FRAME_LOAD_ERROR);
});

test("tentar de novo volta a carregando; status de outro candidato conta como carregando", () => {
  const retried = frameLoading("flavio-bolsonaro");

  assert.equal(payHint({ ...base, photoReady: true, frame: retried }), "Carregando a moldura…");
  assert.equal(payHint({ ...base, photoReady: true, frame: frameFailed("lula") }), "Carregando a moldura…");
});

test("dica sem candidato", () => {
  assert.equal(payHint({ candidateId: "", photoReady: false, ready: false, frame: frameLoaded("") }), "Escolha sua foto e a moldura para continuar.");
  assert.equal(payHint({ candidateId: "", photoReady: true, ready: false, frame: frameLoaded("") }), "Agora escolha a moldura para continuar.");
});

test("as molduras neutra (prévia do /criar) e de exemplo (topo da home) existem na api, fonte do sync-frames", () => {
  for (const id of ["neutral", "exemplo"]) {
    const frame = fileURLToPath(new URL(`../../../api/assets/frames/${id}.png`, import.meta.url));

    assert.ok(existsSync(frame), frame);
  }
});

test("estilo pelo link (?e=): só ids válidos; senão a clássica", () => {
  assert.equal(initialFrameStyle("ondas"), "ondas");
  assert.equal(initialFrameStyle("geometrica"), "geometrica");
  assert.equal(initialFrameStyle(undefined), "classica");
  assert.equal(initialFrameStyle(""), "classica");
  assert.equal(initialFrameStyle("ONDAS"), "classica");
  assert.equal(initialFrameStyle("../lula"), "classica");
  assert.equal(initialFrameStyle(["ondas", "fina"]), "classica");
});

test("prévia usa o PNG de 1080 do candidato + estilo; miniatura usa o WebP", () => {
  assert.equal(previewFrameSrc("lula", "classica"), "/frames/lula.png");
  assert.equal(previewFrameSrc("lula", "ondas"), "/frames/lula--ondas.png");
  assert.equal(previewFrameSrc("flavio-bolsonaro", "fina"), "/frames/flavio-bolsonaro--fina.png");
  assert.equal(previewFrameSrc("", "ondas"), "/frames/neutral.png");
  assert.equal(frameThumbSrc("lula", "classica"), "/frames/lula.webp");
  assert.equal(frameThumbSrc("lula", "listras"), "/frames/lula--listras.webp");
});

test("o status da moldura é por candidato + estilo: pronta em outro estilo não libera o pagamento", () => {
  const ondas = frameKey("lula", "ondas");

  assert.equal(ondas, "lula--ondas");
  assert.equal(frameKey("lula", "classica"), "lula");
  assert.equal(frameKey("", "ondas"), "");
  assert.equal(isFrameReady(frameLoaded(frameKey("lula", "classica")), ondas), false);
  assert.equal(isFrameReady(frameLoaded(ondas), ondas), true);
  assert.equal(payHint({ candidateId: "lula", frameId: ondas, photoReady: true, ready: false, frame: frameLoaded("lula") }), "Carregando a moldura…");
  assert.equal(payHint({ candidateId: "lula", frameId: ondas, photoReady: true, ready: false, frame: frameFailed(ondas) }), FRAME_LOAD_ERROR);
});

test("estilo do partido: some da lista e o link ?e=partido cai na clássica quando está desligado", () => {
  assert.equal(availableFrameStyles(true).length, 13);
  assert.equal(availableFrameStyles(true).at(-1)?.id, "partido");
  assert.equal(availableFrameStyles(false).length, 12);
  assert.ok(!availableFrameStyles(false).some((style) => style.id === "partido"));
  assert.equal(initialFrameStyle("partido"), "partido");
  assert.equal(resolveFrameStyle("partido", false), "classica");
  assert.equal(resolveFrameStyle("partido", true), "partido");
  assert.equal(resolveFrameStyle("metalica", false), "metalica");
});
