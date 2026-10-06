export const FRAME_STYLES = [
  { id: "classica", name: "Clássica" },
  { id: "faixa", name: "Faixa" },
  { id: "listras", name: "Listras" },
  { id: "fina", name: "Fina" },
  { id: "ondas", name: "Ondas" },
  { id: "geometrica", name: "Geométrica" },
  { id: "campanha", name: "Campanha" },
  { id: "vibrante", name: "Vibrante" },
  { id: "moderna", name: "Moderna" },
  { id: "retro", name: "Retrô" },
  { id: "metalica", name: "Metálica" },
  { id: "torcida", name: "Torcida" },
  { id: "partido", name: "Partido" },
] as const;

export type FrameStyleId = (typeof FRAME_STYLES)[number]["id"];

export const FRAME_STYLE_IDS = FRAME_STYLES.map((style) => style.id) as [FrameStyleId, ...FrameStyleId[]];

export const DEFAULT_FRAME_STYLE: FrameStyleId = "classica";

// Estilo com o símbolo do partido: pode ser desligado na hora (PARTY_STYLE_ENABLED=false na api), por risco de marca.
export const PARTY_FRAME_STYLE: FrameStyleId = "partido";

export const PARTY_STYLE_UNAVAILABLE_MESSAGE = "Este estilo não está disponível.";

export function findFrameStyle(id: string): (typeof FRAME_STYLES)[number] | undefined {
  return FRAME_STYLES.find((style) => style.id === id);
}

// A clássica mantém o nome antigo (<candidato>.png) para não quebrar assets e caminhos do web.
export function frameFileName(candidateId: string, styleId: FrameStyleId): string {
  return styleId === DEFAULT_FRAME_STYLE ? `${candidateId}.png` : `${candidateId}--${styleId}.png`;
}
