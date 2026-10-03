export const FRAME_SIZE = 1080;
export const FRAME_RING_RATIO = 0.13;
export const MAX_ZOOM = 3;

export type PlacePhotoInput = {
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  size?: number;
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
  const diameter = innerRadius(size) * 2;
  const scale = Math.max(diameter / input.imageWidth, diameter / input.imageHeight) * input.zoom;
  const width = input.imageWidth * scale;
  const height = input.imageHeight * scale;

  return {
    left: size / 2 - width / 2 + input.offsetX * size,
    top: size / 2 - height / 2 + input.offsetY * size,
    width,
    height,
  };
}
