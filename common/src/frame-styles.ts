import type { FrameHole } from "./framing";

export const FRAME_STYLES = [
  { id: "modelo-1", name: "Modelo 1" },
  { id: "modelo-2", name: "Modelo 2" },
  { id: "modelo-3", name: "Modelo 3" },
  { id: "modelo-4", name: "Modelo 4" },
  { id: "modelo-5", name: "Modelo 5" },
  { id: "modelo-6", name: "Modelo 6" },
] as const;

export type FrameStyle = (typeof FRAME_STYLES)[number];
export type FrameStyleId = FrameStyle["id"];

export const FRAME_STYLE_IDS = FRAME_STYLES.map((style) => style.id) as [FrameStyleId, ...FrameStyleId[]];

export const DEFAULT_FRAME_STYLE: FrameStyleId = "modelo-1";

// Furo de cada moldura, na ordem dos modelos (medido pelo frames:import da api).
// Cada candidato tem a sua quantidade de modelos: a lista dele é o começo de FRAME_STYLES.
const FRAME_HOLES: Record<string, readonly FrameHole[]> = {
  lula: [
    { cx: 0.5, cy: 0.406, r: 0.393 },
    { cx: 0.5, cy: 0.385, r: 0.394 },
    { cx: 0.507, cy: 0.375, r: 0.398 },
    { cx: 0.499, cy: 0.402, r: 0.364 },
    { cx: 0.499, cy: 0.408, r: 0.387 },
    { cx: 0.498, cy: 0.408, r: 0.431 },
  ],
  "flavio-bolsonaro": [
    { cx: 0.5, cy: 0.394, r: 0.388 },
    { cx: 0.502, cy: 0.381, r: 0.395 },
    { cx: 0.5, cy: 0.373, r: 0.385 },
    { cx: 0.5, cy: 0.396, r: 0.375 },
    { cx: 0.5, cy: 0.412, r: 0.377 },
  ],
};

export function frameStylesFor(candidateId: string): readonly FrameStyle[] {
  return FRAME_STYLES.slice(0, FRAME_HOLES[candidateId]?.length ?? 0);
}

// Com candidateId, só acha o modelo se aquele candidato tiver essa moldura.
export function findFrameStyle(id: string, candidateId?: string): FrameStyle | undefined {
  const styles = candidateId === undefined ? FRAME_STYLES : frameStylesFor(candidateId);

  return styles.find((style) => style.id === id);
}

export function frameHole(candidateId: string, styleId: FrameStyleId): FrameHole | undefined {
  return FRAME_HOLES[candidateId]?.[FRAME_STYLE_IDS.indexOf(styleId)];
}

// O primeiro modelo usa o nome curto (<candidato>.png): é a moldura que a home mostra.
export function frameFileName(candidateId: string, styleId: FrameStyleId): string {
  return styleId === DEFAULT_FRAME_STYLE ? `${candidateId}.png` : `${candidateId}--${styleId}.png`;
}

// Máscara da foto daquela moldura (onde a foto aparece), na subpasta masks.
export function frameMaskFileName(candidateId: string, styleId: FrameStyleId): string {
  return `masks/${frameFileName(candidateId, styleId)}`;
}
