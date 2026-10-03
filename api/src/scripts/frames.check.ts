import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES } from "@moldura/common";
import { renderPlaceholderFrame, validateFrame } from "@/scripts/placeholder-frame";

const FRAMES_DIR = path.resolve("assets/frames");

test("o placeholder passa no validador", async () => {
  const candidate = CANDIDATES[1];
  const png = await renderPlaceholderFrame(candidate);

  assert.deepEqual(await validateFrame(png), []);
});

test("o validador acusa moldura com centro opaco", async () => {
  const sharp = (await import("sharp")).default;
  const solid = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: "#ff0000" } }).png().toBuffer();

  const problems = await validateFrame(solid);

  assert.ok(problems.length > 0);
});

for (const candidate of CANDIDATES) {
  test(`assets/frames/${candidate.id}.png existe e é válida`, async () => {
    const png = await readFile(path.join(FRAMES_DIR, `${candidate.id}.png`));

    assert.deepEqual(await validateFrame(png), []);
  });
}
