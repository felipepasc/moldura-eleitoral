import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CANDIDATES } from "@moldura/common";
import { NEUTRAL_FRAME_ID, NEUTRAL_SLIDE, buildHeroSlides } from "./hero-slides";

function seeded(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (slides: ReturnType<typeof buildHeroSlides>) => slides.map((slide) => (slide.kind === "neutral" ? "neutral" : slide.candidate.id));

test("o primeiro slide é sempre o neutro", () => {
  for (let seed = 1; seed < 20; seed += 1) {
    const slides = buildHeroSlides(CANDIDATES, seeded(seed));

    assert.equal(slides[0], NEUTRAL_SLIDE);
    assert.equal(slides[0].kind, "neutral");
  }
});

test("cada candidato aparece exatamente uma vez, e só depois do neutro", () => {
  const slides = buildHeroSlides(CANDIDATES, seeded(7));
  const rest = ids(slides).slice(1);

  assert.equal(slides.length, CANDIDATES.length + 1);
  assert.deepEqual([...rest].sort(), CANDIDATES.map((candidate) => candidate.id).sort());
  assert.ok(!rest.includes("neutral"));
});

test("a ordem é determinística com o mesmo rng e muda com outra semente", () => {
  assert.deepEqual(ids(buildHeroSlides(CANDIDATES, seeded(42))), ids(buildHeroSlides(CANDIDATES, seeded(42))));
  assert.notDeepEqual(ids(buildHeroSlides(CANDIDATES, seeded(42))), ids(buildHeroSlides(CANDIDATES, seeded(43))));
});

test("não altera a lista recebida", () => {
  const input = [...CANDIDATES];
  const before = input.map((candidate) => candidate.id);

  buildHeroSlides(input, seeded(3));
  assert.deepEqual(input.map((candidate) => candidate.id), before);
});

test("sem candidatos, só o slide neutro", () => {
  assert.deepEqual(buildHeroSlides([], seeded(1)), [NEUTRAL_SLIDE]);
});

test("o rng padrão funciona e rng no limite (quase 1) não estoura o índice", () => {
  assert.equal(buildHeroSlides(CANDIDATES).length, CANDIDATES.length + 1);
  assert.equal(new Set(ids(buildHeroSlides(CANDIDATES, () => 0.999999999))).size, CANDIDATES.length + 1);
  assert.equal(new Set(ids(buildHeroSlides(CANDIDATES, () => 0))).size, CANDIDATES.length + 1);
});

test("a moldura neutra existe na api (fonte do sync-frames) com o id do slide neutro", () => {
  const frame = fileURLToPath(new URL(`../../../api/assets/frames/${NEUTRAL_FRAME_ID}.png`, import.meta.url));

  assert.ok(existsSync(frame), frame);
});
