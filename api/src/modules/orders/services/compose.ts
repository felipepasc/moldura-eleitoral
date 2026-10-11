import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { FRAME_SIZE, innerRadius, placePhoto } from "@moldura/common";
import type { FrameHole, Framing } from "@moldura/common";

const BACKGROUND = { r: 229, g: 231, b: 235, alpha: 1 };

// Molduras curadas têm furo de formato livre: a foto é recortada pela máscara e posicionada pelo furo.
export type FrameLayout = { maskPath: string; hole: FrameHole };

// Sem layout (molduras geradas), a foto fica no círculo central.
export async function composeImage(photo: Buffer, framing: Framing, framePath: string, layout?: FrameLayout): Promise<Buffer> {
  const size = FRAME_SIZE;
  const oriented = await sharp(photo).rotate().toBuffer({ resolveWithObject: true });

  const placement = placePhoto({
    imageWidth: oriented.info.width,
    imageHeight: oriented.info.height,
    zoom: framing.zoom,
    offsetX: framing.offsetX,
    offsetY: framing.offsetY,
    size,
    hole: layout?.hole,
  });

  const width = Math.round(placement.width);
  const height = Math.round(placement.height);
  const left = Math.round(placement.left);
  const top = Math.round(placement.top);

  const visibleLeft = Math.max(0, left);
  const visibleTop = Math.max(0, top);
  const visibleRight = Math.min(size, left + width);
  const visibleBottom = Math.min(size, top + height);

  const layers: OverlayOptions[] = [];

  if (visibleRight > visibleLeft && visibleBottom > visibleTop) {
    const scaled = await sharp(oriented.data).resize(width, height, { fit: "fill" }).toBuffer();

    const crop = await sharp(scaled)
      .extract({
        left: visibleLeft - left,
        top: visibleTop - top,
        width: visibleRight - visibleLeft,
        height: visibleBottom - visibleTop,
      })
      .toBuffer();

    layers.push({ input: crop, left: visibleLeft, top: visibleTop });
  }

  const base = await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite(layers)
    .png()
    .toBuffer();

  const mask = layout
    ? await sharp(layout.maskPath).resize(size, size).png().toBuffer()
    : Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${innerRadius(size)}" fill="#fff"/></svg>`,
      );

  const maskedPhoto = await sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const frame = await sharp(framePath).resize(size, size).png().toBuffer();

  return sharp(maskedPhoto)
    .composite([{ input: frame }])
    .png()
    .toBuffer();
}
