export const FRAME_SIZE = 1080;
export const FRAME_RING_RATIO = 0.13;
export const MAX_ZOOM = 3;

// Quadrado que cobre o furo da moldura, em frações do lado da imagem.
export type FrameHole = { cx: number; cy: number; r: number };

// Furo das molduras geradas (neutra e de exemplo): círculo no centro.
export const CENTER_HOLE: FrameHole = { cx: 0.5, cy: 0.5, r: 0.5 - FRAME_RING_RATIO };

export type PlacePhotoInput = {
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  size?: number;
  hole?: FrameHole;
};

export type PhotoPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function innerRadius(size: number = FRAME_SIZE): number {
  return size / 2 - size * FRAME_RING_RATIO;
}

export function placePhoto(input: PlacePhotoInput): PhotoPlacement {
  const size = input.size ?? FRAME_SIZE;
  const hole = input.hole ?? CENTER_HOLE;
  const diameter = hole.r * 2 * size;
  const scale = Math.max(diameter / input.imageWidth, diameter / input.imageHeight) * input.zoom;
  const width = input.imageWidth * scale;
  const height = input.imageHeight * scale;

  return {
    left: hole.cx * size - width / 2 + input.offsetX * size,
    top: hole.cy * size - height / 2 + input.offsetY * size,
    width,
    height,
  };
}
