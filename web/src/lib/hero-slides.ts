import type { Candidate } from "@moldura/common";

// Moldura de exemplo (não é candidato): gerada pela api em assets/frames/neutral.png.
export const NEUTRAL_FRAME_ID = "neutral";

export type HeroSlide = { kind: "neutral"; key: string } | { kind: "candidate"; key: string; candidate: Candidate };

export const NEUTRAL_SLIDE: HeroSlide = { kind: "neutral", key: NEUTRAL_FRAME_ID };

// Topo neutro: sempre começa no slide sem candidato; depois todos os candidatos em ordem
// embaralhada (Fisher–Yates). O rng é injetável para os testes; Math.random basta, não é segurança.
export function buildHeroSlides(candidates: readonly Candidate[], rng: () => number = Math.random): HeroSlide[] {
  const shuffled = [...candidates];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pick = Math.min(index, Math.floor(rng() * (index + 1)));
    const current = shuffled[index];

    shuffled[index] = shuffled[pick];
    shuffled[pick] = current;
  }

  return [NEUTRAL_SLIDE, ...shuffled.map((candidate): HeroSlide => ({ kind: "candidate", key: candidate.id, candidate }))];
}
