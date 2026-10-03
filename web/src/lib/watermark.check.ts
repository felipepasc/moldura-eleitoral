import assert from "node:assert/strict";
import { test } from "node:test";
import { WATERMARK_ANGLES, WATERMARK_STEP_X, WATERMARK_STEP_Y, uncoveredWindow, watermarkLayout, watermarkTiles } from "./watermark";

const SIZE = 540;

test("as duas camadas cruzadas cobrem toda janela de 15% × 15% da prévia", () => {
  const tiles = watermarkLayout(SIZE);

  assert.equal(uncoveredWindow(SIZE, tiles, 0.15, 3), null);
});

test("uma camada sozinha é rala demais, por isso cruzamos duas", () => {
  const single = watermarkTiles(SIZE, WATERMARK_ANGLES[0], WATERMARK_STEP_X * 3, WATERMARK_STEP_Y * 3);

  assert.notEqual(uncoveredWindow(SIZE, single, 0.15, 3), null);
});

test("cobre também em 1080 (escala) e não gera posições muito fora da tela", () => {
  const tiles = watermarkLayout(1080);

  assert.equal(uncoveredWindow(1080, tiles, 0.15, 6), null);

  for (const tile of tiles) {
    assert.ok(tile.x > -1080 * 0.5 && tile.x < 1080 * 1.5 && tile.y > -1080 * 0.5 && tile.y < 1080 * 1.5);
  }
});

test("os ladrilhos usam os dois ângulos (−30° e +30°)", () => {
  const angles = new Set(watermarkLayout(SIZE).map((tile) => Math.round((tile.angle * 180) / Math.PI)));

  assert.deepEqual([...angles].sort((a, b) => a - b), [-30, 30]);
});

test("uncoveredWindow acha a janela vazia quando não há ladrilhos", () => {
  assert.deepEqual(uncoveredWindow(100, [], 0.15, 10), { x: 0, y: 0 });
});
