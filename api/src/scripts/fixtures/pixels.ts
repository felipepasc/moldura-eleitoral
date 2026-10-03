import sharp from "sharp";

export async function pixelAt(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * 4;

  return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}
