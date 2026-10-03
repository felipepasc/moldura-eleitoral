import { findCandidate } from "@moldura/common";

const NEUTRAL_PREVIEW_FRAME = "/frames/neutral.png";

// Sem ?c= válido o /criar não escolhe ninguém: mostra a moldura neutra até a pessoa escolher.
export function initialCandidateId(param: string | string[] | undefined): string {
  if (typeof param !== "string" || !findCandidate(param)) {
    return "";
  }

  return param;
}

// A prévia precisa da moldura em 1080 px (PNG), não do WebP reduzido da home.
export function previewFrameSrc(candidateId: string): string {
  if (!candidateId) {
    return NEUTRAL_PREVIEW_FRAME;
  }

  return `/frames/${candidateId}.png`;
}

export type SubmitState = { candidateId: string; hasFile: boolean; hasImage: boolean; frameReady: boolean; busy: boolean };

export function canSubmit(state: SubmitState): boolean {
  return state.candidateId !== "" && state.hasFile && state.hasImage && state.frameReady && !state.busy;
}
