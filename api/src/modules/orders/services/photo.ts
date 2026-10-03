import sharp from "sharp";

const MAX_PHOTO_SIDE = 2000;
const SHARP_OPTIONS = { limitInputPixels: 50_000_000 };
const ALLOWED_FORMATS = ["jpeg", "png", "webp"];

export class InvalidPhotoError extends Error {}

export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(input, SHARP_OPTIONS).metadata();

    if (!metadata.format || !ALLOWED_FORMATS.includes(metadata.format)) {
      throw new InvalidPhotoError("A foto precisa ser JPG, PNG ou WebP.");
    }

    return await sharp(input, SHARP_OPTIONS)
      .rotate()
      .resize(MAX_PHOTO_SIDE, MAX_PHOTO_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (error) {
    if (error instanceof InvalidPhotoError) {
      throw error;
    }

    throw new InvalidPhotoError("Não consegui ler essa foto. Tente outra.");
  }
}
