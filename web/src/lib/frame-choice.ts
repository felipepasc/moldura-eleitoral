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

export type SubmitState = {
  candidateId: string;
  hasFile: boolean;
  hasImage: boolean;
  frameReady: boolean;
  busy: boolean;
  // Consentimento para tratar a foto e a moldura (dado sensível) e declaração de idade: as duas são obrigatórias.
  consent: boolean;
  adult: boolean;
  salesOpen: boolean;
};

export function canSubmit(state: SubmitState): boolean {
  return state.candidateId !== "" && state.hasFile && state.hasImage && state.frameReady && !state.busy && state.consent && state.adult && state.salesOpen;
}

// Status do carregamento da imagem da moldura, sempre ligado ao id do candidato (independente do erro genérico).
export type FrameStatus = { id: string; state: "loading" | "ready" | "failed" };

export const FRAME_LOAD_ERROR = "Não foi possível carregar a moldura.";

export function frameLoading(id: string): FrameStatus {
  return { id, state: "loading" };
}

export function frameLoaded(id: string): FrameStatus {
  return { id, state: "ready" };
}

export function frameFailed(id: string): FrameStatus {
  return { id, state: "failed" };
}

export function isFrameReady(status: FrameStatus, candidateId: string): boolean {
  return status.id === candidateId && status.state === "ready";
}

export function isFrameFailed(status: FrameStatus, candidateId: string): boolean {
  return status.id === candidateId && status.state === "failed";
}

export type HintState = { candidateId: string; photoReady: boolean; ready: boolean; frame: FrameStatus; confirmed?: boolean; salesOpen?: boolean };

export const SALES_CLOSED_MESSAGE = "As vendas estão fechadas no momento.";

// Diz o que falta para pagar. A falha da moldura vem do status (não do texto de erro, que a foto limpa).
export function payHint(state: HintState): string {
  if (state.ready) {
    return "Você paga por Pix e baixa a foto em seguida.";
  }

  if (state.salesOpen === false) {
    return SALES_CLOSED_MESSAGE;
  }

  if (state.candidateId && isFrameFailed(state.frame, state.candidateId)) {
    return FRAME_LOAD_ERROR;
  }

  if (state.candidateId && !isFrameReady(state.frame, state.candidateId)) {
    return "Carregando a moldura…";
  }

  if (state.photoReady && state.candidateId) {
    return state.confirmed === false ? "Marque as duas confirmações acima para continuar." : "Quase lá: confira a prévia e continue.";
  }

  if (state.photoReady) {
    return "Agora escolha a moldura para continuar.";
  }

  if (state.candidateId) {
    return "Agora escolha a sua foto para continuar.";
  }

  return "Escolha sua foto e a moldura para continuar.";
}
