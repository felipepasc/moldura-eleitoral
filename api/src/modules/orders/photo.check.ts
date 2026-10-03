import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { InvalidPhotoError, normalizePhoto } from "@/modules/orders/services/photo";

const RAW = { create: { width: 40, height: 40, channels: 3 as const, background: { r: 10, g: 20, b: 30 } } };

test("normalizePhoto aceita JPEG, PNG e WebP verdadeiros", async () => {
  for (const buffer of [await sharp(RAW).jpeg().toBuffer(), await sharp(RAW).png().toBuffer(), await sharp(RAW).webp().toBuffer()]) {
    const out = await normalizePhoto(buffer);

    assert.equal((await sharp(out).metadata()).format, "jpeg");
  }
});

test("normalizePhoto rejeita SVG, GIF, TIFF, PDF e bytes aleatórios sem chamar o sharp", async () => {
  const samples = [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
    Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary"),
    await sharp(RAW).tiff().toBuffer(),
    Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
    Buffer.alloc(0),
  ];

  for (const sample of samples) {
    await assert.rejects(normalizePhoto(sample), InvalidPhotoError);
  }
});

test("normalizePhoto rejeita cabeçalhos truncados", async () => {
  const jpeg = await sharp(RAW).jpeg().toBuffer();
  const png = await sharp(RAW).png().toBuffer();
  const webp = await sharp(RAW).webp().toBuffer();

  for (const truncated of [jpeg.subarray(0, 2), png.subarray(0, 7), webp.subarray(0, 11), Buffer.from("RIFF")]) {
    await assert.rejects(normalizePhoto(truncated), InvalidPhotoError);
  }
});

test("a checagem dos bytes mágicos vem antes do sharp: RIFF que não é WebP é rejeitado", async () => {
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WAVEfmt ")]);

  await assert.rejects(normalizePhoto(wav), InvalidPhotoError);
});
