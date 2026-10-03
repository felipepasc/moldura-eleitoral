import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES } from "@moldura/common";
import { buildFrameSvg, missingGlyphs, renderPlaceholderFrame, validateFrame } from "@/scripts/placeholder-frame";

const FRAMES_DIR = path.resolve("assets/frames");

test("o placeholder passa no validador", async () => {
  const candidate = CANDIDATES[1];
  const png = await renderPlaceholderFrame(candidate);

  assert.deepEqual(await validateFrame(png), []);
});

test("o SVG da moldura usa só caminhos de glifos, sem <text>", () => {
  for (const candidate of CANDIDATES) {
    const svg = buildFrameSvg(candidate);

    assert.ok(!svg.includes("<text"), candidate.id);
    assert.ok(svg.includes("<path"), candidate.id);
  }
});

test("a fonte cobre todos os caracteres de frameName e número", () => {
  for (const candidate of CANDIDATES) {
    assert.deepEqual(missingGlyphs(candidate.frameName + candidate.number), [], candidate.id);
  }
});

test("o validador acusa moldura com disco central parcialmente opaco", async () => {
  const sharp = (await import("sharp")).default;
  const png = await renderPlaceholderFrame(CANDIDATES[0]);
  const dot = await sharp({ create: { width: 40, height: 40, channels: 4, background: "#ff0000" } }).png().toBuffer();
  const dirty = await sharp(png).composite([{ input: dot, left: 600, top: 500 }]).png().toBuffer();

  assert.ok((await validateFrame(dirty)).length > 0);
});

test("o validador acusa moldura com canto opaco", async () => {
  const sharp = (await import("sharp")).default;
  const png = await renderPlaceholderFrame(CANDIDATES[0]);
  const dot = await sharp({ create: { width: 30, height: 30, channels: 4, background: "#ff0000" } }).png().toBuffer();
  const dirty = await sharp(png).composite([{ input: dot, left: 1050, top: 0 }]).png().toBuffer();

  assert.ok((await validateFrame(dirty)).length > 0);
});

test("o validador acusa moldura sem anel", async () => {
  const sharp = (await import("sharp")).default;
  const empty = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

  assert.ok((await validateFrame(empty)).length > 0);
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
