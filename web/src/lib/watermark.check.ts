import assert from "node:assert/strict";
import { test } from "node:test";
import { WATERMARK_ANGLES, WATERMARK_STEP_X, WATERMARK_STEP_Y, tileTouchesWindow, uncoveredWindow, watermarkLayout, watermarkTiles } from "./watermark";

const SIZE = 540;

test("as duas camadas cruzadas cobrem (com o texto, não só o centro) toda janela de 15% × 15% da prévia", () => {
  const tiles = watermarkLayout(SIZE);

  assert.equal(uncoveredWindow(SIZE, tiles, 0.15, 3), null);
});

test("cobre também em 1080 (escala)", () => {
  assert.equal(uncoveredWindow(1080, watermarkLayout(1080), 0.15, 6), null);
});

test("uma grade com um só ângulo e passos 3× maiores deixa janelas sem marca (o verificador acusa)", () => {
  const sparse = watermarkTiles(SIZE, WATERMARK_ANGLES[0], WATERMARK_STEP_X * 3, WATERMARK_STEP_Y * 3);

  assert.notEqual(uncoveredWindow(SIZE, sparse, 0.15, 3), null);
});

test("nenhum ladrilho fica totalmente fora do canvas", () => {
  for (const size of [SIZE, 1080]) {
    for (const tile of watermarkLayout(size)) {
      assert.ok(tileTouchesWindow(tile, 0, 0, size), `${tile.x},${tile.y}`);
    }
  }
});

test("os ladrilhos usam os dois ângulos (−30° e +30°)", () => {
  const angles = new Set(watermarkLayout(SIZE).map((tile) => Math.round((tile.angle * 180) / Math.PI)));

  assert.deepEqual([...angles].sort((a, b) => a - b), [-30, 30]);
});

test("o texto de uma linha não encosta no da vizinha na mesma grade (lê melhor em telas pequenas)", () => {
  const tiles = watermarkLayout(SIZE).filter((tile) => tile.angle === WATERMARK_ANGLES[0] && tile.row === 0);
  const xs = tiles.map((tile) => tile.x).sort((a, b) => a - b);

  for (let index = 1; index < xs.length; index += 1) {
    const distance = (xs[index] - xs[index - 1]) / Math.cos(WATERMARK_ANGLES[0]);

    assert.ok(distance > tiles[0].halfWidth * 2 + 8, `${distance}`);
  }
});

test("tileTouchesWindow usa a extensão do texto e não só o centro", () => {
  const tile = { x: 100, y: 100, angle: 0, row: 0, halfWidth: 50 };

  assert.equal(tileTouchesWindow(tile, 140, 90, 20), true);
  assert.equal(tileTouchesWindow(tile, 160, 90, 20), false);
  assert.equal(tileTouchesWindow(tile, 100, 120, 20), false);
});

test("uncoveredWindow acha a janela vazia quando não há ladrilhos", () => {
  assert.deepEqual(uncoveredWindow(100, [], 0.15, 10), { x: 0, y: 0 });
});
