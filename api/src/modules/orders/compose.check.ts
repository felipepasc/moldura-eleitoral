import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";
import { frameFileName, frameHole, frameMaskFileName } from "@moldura/common";
import type { FrameStyleId } from "@moldura/common";
import { composeImage } from "@/modules/orders/services/compose";
import { InvalidPhotoError, normalizePhoto } from "@/modules/orders/services/photo";
import { pixelAt } from "@/scripts/fixtures/pixels";

// Moldura gerada (círculo no centro): é montada sem layout.
const FRAME = path.resolve("assets/frames/neutral.png");

function curated(candidateId: string, styleId: FrameStyleId) {
  const hole = frameHole(candidateId, styleId);

  assert.ok(hole);

  return {
    hole,
    framePath: path.resolve("assets/frames", frameFileName(candidateId, styleId)),
    layout: { maskPath: path.resolve("assets/frames", frameMaskFileName(candidateId, styleId)), hole },
  };
}

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

for (const [candidateId, styleId] of [["lula", "modelo-1"], ["lula", "modelo-4"], ["flavio-bolsonaro", "modelo-1"], ["flavio-bolsonaro", "modelo-5"]] as const) {
  test(`compõe com a moldura curada ${candidateId} ${styleId}: foto no furo, faixa do nome por cima e fora transparente`, async () => {
    const photo = await normalizePhoto(await solidPhoto(800, 800));
    const { hole, framePath, layout } = curated(candidateId, styleId);
    const out = await composeImage(photo, { zoom: 1, offsetX: 0, offsetY: 0 }, framePath, layout);
    const meta = await sharp(out).metadata();

    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1080);

    const middle = await pixelAt(out, Math.round(hole.cx * 1080), Math.round(hole.cy * 1080));
    assert.ok(middle.r > 150 && middle.g < 80 && middle.a === 255, "o meio do furo deve ser a foto");

    // Onde a máscara deixa a foto aparecer não sobra transparência: ou é foto, ou é moldura por cima.
    const mask = await sharp(layout.maskPath).ensureAlpha().raw().toBuffer();
    const result = await sharp(out).ensureAlpha().raw().toBuffer();

    for (let index = 3; index < mask.length; index += 4 * 7) {
      if (mask[index] === 255) {
        assert.equal(result[index], 255, `ponto vazado em ${(index - 3) / 4}`);
      }
    }

    const label = await pixelAt(out, 540, 930);
    assert.ok(label.a > 250, "a faixa do nome fica por cima da foto");
    assert.ok(!(label.r > 190 && label.g < 45 && label.b < 45) || candidateId === "lula", "a faixa não é a foto");

    assert.equal((await pixelAt(out, 3, 3)).a, 0);
    assert.equal((await pixelAt(out, 1076, 3)).a, 0);
  });
}

test("moldura quadrada (lula modelo-6) sai sem cantos transparentes", async () => {
  const photo = await normalizePhoto(await solidPhoto(800, 800));
  const { framePath, layout } = curated("lula", "modelo-6");
  const out = await composeImage(photo, { zoom: 1, offsetX: 0, offsetY: 0 }, framePath, layout);

  for (const [x, y] of [[3, 3], [1076, 3], [3, 1076], [1076, 1076]]) {
    assert.ok((await pixelAt(out, x, y)).a > 250);
  }
});

test("foto arrastada para longe: o furo mostra o fundo cinza, nunca transparência", async () => {
  const photo = await normalizePhoto(await solidPhoto(300, 300));
  const { hole, framePath, layout } = curated("flavio-bolsonaro", "modelo-2");
  const out = await composeImage(photo, { zoom: 1, offsetX: 1, offsetY: -1 }, framePath, layout);
  const middle = await pixelAt(out, Math.round(hole.cx * 1080), Math.round(hole.cy * 1080));

  assert.equal(middle.a, 255);
  assert.ok(Math.abs(middle.r - 229) < 4 && Math.abs(middle.b - 235) < 4);
});
