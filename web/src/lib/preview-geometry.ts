import type { Framing } from "@moldura/common";

// Buffer da prévia no navegador: metade da resolução final (a foto limpa só existe no servidor, em 1080).
export const PREVIEW_SIZE = 540;

const clamp = (value: number) => Math.min(1, Math.max(-1, value));

// O deslocamento é fração da largura exibida, então independe do tamanho do buffer do canvas.
export function dragFraming(start: Framing, from: { x: number; y: number }, to: { x: number; y: number }, displayedWidth: number): Framing {
  return {
    ...start,
    offsetX: clamp(start.offsetX + (to.x - from.x) / displayedWidth),
    offsetY: clamp(start.offsetY + (to.y - from.y) / displayedWidth),
  };
}
