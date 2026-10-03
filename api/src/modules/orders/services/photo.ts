import sharp from "sharp";

const MAX_PHOTO_SIDE = 2000;
const SHARP_OPTIONS = { limitInputPixels: 50_000_000 };
const ALLOWED_FORMATS = ["jpeg", "png", "webp"];

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class InvalidPhotoError extends Error {}

// Só JPEG, PNG e WebP chegam ao sharp: o resto (SVG, GIF, TIFF, PDF...) é recusado pelos bytes iniciais.
function hasAllowedMagicBytes(input: Buffer): boolean {
  if (input.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC) || input.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return true;
  }

  return input.length >= 12 && input.subarray(0, 4).toString("latin1") === "RIFF" && input.subarray(8, 12).toString("latin1") === "WEBP";
}

export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  if (!hasAllowedMagicBytes(input)) {
    throw new InvalidPhotoError("A foto precisa ser JPG, PNG ou WebP.");
  }

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
