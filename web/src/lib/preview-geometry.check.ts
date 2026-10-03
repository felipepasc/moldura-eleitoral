import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAME_SIZE, placePhoto } from "@moldura/common";
import { PREVIEW_SIZE, dragFraming } from "./preview-geometry";

test("a prévia tem 540 px e o servidor continua em 1080", () => {
  assert.equal(PREVIEW_SIZE, 540);
  assert.equal(FRAME_SIZE, 1080);
});

test("a mesma framing posiciona a foto proporcionalmente em 540 e em 1080", () => {
  for (const framing of [{ zoom: 1, offsetX: 0, offsetY: 0 }, { zoom: 2.3, offsetX: 0.21, offsetY: -0.4 }, { zoom: 3, offsetX: -1, offsetY: 1 }]) {
    const small = placePhoto({ imageWidth: 800, imageHeight: 1200, ...framing, size: PREVIEW_SIZE });
    const big = placePhoto({ imageWidth: 800, imageHeight: 1200, ...framing, size: FRAME_SIZE });

    for (const field of ["left", "top", "width", "height"] as const) {
      assert.ok(Math.abs(small[field] * 2 - big[field]) < 1e-9, field);
    }
  }
});

test("o arrasto usa a fração da largura exibida: a framing não depende do tamanho do canvas", () => {
  const start = { zoom: 1.5, offsetX: 0.1, offsetY: -0.1 };
  const moved = dragFraming(start, { x: 100, y: 100 }, { x: 160, y: 70 }, 400);

  assert.deepEqual(moved, { zoom: 1.5, offsetX: 0.1 + 60 / 400, offsetY: -0.1 - 30 / 400 });
  assert.deepEqual(dragFraming(start, { x: 0, y: 0 }, { x: 4000, y: -4000 }, 400), { zoom: 1.5, offsetX: 1, offsetY: -1 });
});
