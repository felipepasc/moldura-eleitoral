import sharp from "sharp";

const MAX_PHOTO_SIDE = 2000;

export class InvalidPhotoError extends Error {}

export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize(MAX_PHOTO_SIDE, MAX_PHOTO_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new InvalidPhotoError("Não consegui ler essa foto. Tente outra.");
  }
}
