import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";
import { composeImage } from "@/modules/orders/services/compose";
import { InvalidPhotoError, normalizePhoto } from "@/modules/orders/services/photo";
import { pixelAt } from "@/scripts/fixtures/pixels";

const FRAME = path.resolve("assets/frames/flavio-bolsonaro.png");

async function solidPhoto(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
}

test("monta PNG 1080x1080 com a foto no centro e a moldura no anel", async () => {
  const photo = await normalizePhoto(await solidPhoto(600, 400));
  const out = await composeImage(photo, { zoom: 1, offsetX: 0, offsetY: 0 }, FRAME);
  const meta = await sharp(out).metadata();

  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);

  const center = await pixelAt(out, 540, 540);
  assert.ok(center.r > 150 && center.g < 80 && center.a === 255, "centro deve ser a foto vermelha");

  const ring = await pixelAt(out, 540, 70);
  assert.equal(ring.a, 255);
  assert.ok(ring.b > ring.r, "anel deve ter a cor azul da moldura");

  const corner = await pixelAt(out, 3, 3);
  assert.equal(corner.a, 0);
});

test("enquadramento extremo (foto não cobre o círculo) monta sem erro", async () => {
  const photo = await normalizePhoto(await solidPhoto(300, 300));

  const out = await composeImage(photo, { zoom: 1, offsetX: 1, offsetY: -1 }, FRAME);
  const meta = await sharp(out).metadata();

  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);
});

test("normalizePhoto rejeita bytes que não são imagem", async () => {
  await assert.rejects(normalizePhoto(Buffer.from("isto não é uma imagem")), InvalidPhotoError);
});

test("normalizePhoto limita o lado maior a 2000 px", async () => {
  const big = await solidPhoto(4000, 3000);
  const normalized = await normalizePhoto(big);
  const meta = await sharp(normalized).metadata();

  assert.equal(meta.width, 2000);
  assert.equal(meta.height, 1500);
});

test("normalizePhoto rejeita SVG, GIF e TIFF mesmo que decodificáveis", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } }).gif().toBuffer();
  const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } }).tiff().toBuffer();

  await assert.rejects(normalizePhoto(svg), InvalidPhotoError);
  await assert.rejects(normalizePhoto(gif), InvalidPhotoError);
  await assert.rejects(normalizePhoto(tiff), InvalidPhotoError);
});

test("normalizePhoto aceita jpeg, png e webp", async () => {
  const base = { create: { width: 20, height: 20, channels: 3 as const, background: { r: 1, g: 2, b: 3 } } };

  for (const buffer of [await sharp(base).jpeg().toBuffer(), await sharp(base).png().toBuffer(), await sharp(base).webp().toBuffer()]) {
    const out = await normalizePhoto(buffer);

    assert.equal((await sharp(out).metadata()).format, "jpeg");
  }
});
