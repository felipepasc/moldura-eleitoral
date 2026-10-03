import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES, CreateOrderSchema, findCandidate, findParty } from "@moldura/common";
import { NEUTRAL_FRAME, buildFrameSvg, missingGlyphs, renderPlaceholderFrame, validateFrame } from "@/scripts/placeholder-frame";

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

test("buildFrameSvg falha com erro claro quando a fonte não cobre um caractere", () => {
  const broken = { ...CANDIDATES[0], frameName: "LULA 漢" };

  assert.throws(() => buildFrameSvg(broken), /glifo/);
});

test("a moldura tem contorno escuro fino na borda externa, mesmo com faixa externa branca", async () => {
  const lula = CANDIDATES.find((candidate) => candidate.id === "lula");

  assert.ok(lula);

  const png = await renderPlaceholderFrame(lula);
  const { data, info } = await (await import("sharp")).default(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => {
    const index = (y * info.width + x) * 4;

    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
  };
  const edge = pixel(540, 1);

  assert.equal(edge.a, 255);
  assert.ok(edge.r + edge.g + edge.b < 400, "borda externa precisa ser escura");
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

test("a moldura neutra passa no validador, não tem número e não é candidato", async () => {
  const png = await readFile(path.join(FRAMES_DIR, `${NEUTRAL_FRAME.id}.png`));

  assert.deepEqual(await validateFrame(png), []);
  assert.equal(NEUTRAL_FRAME.id, "neutral");
  assert.equal(NEUTRAL_FRAME.number, undefined);
  assert.deepEqual(missingGlyphs(NEUTRAL_FRAME.frameName), []);
  assert.equal(findCandidate("neutral"), undefined);
  assert.ok(!CANDIDATES.some((candidate) => candidate.id === "neutral"));
  assert.equal(CreateOrderSchema.shape.candidateId.safeParse("neutral").success, false);
});

test("a moldura neutra não usa as cores de nenhum partido", () => {
  const svg = buildFrameSvg(NEUTRAL_FRAME).toLowerCase();

  assert.ok(svg.includes("<path"));
  assert.ok(!svg.includes("<text"));

  for (const color of NEUTRAL_FRAME.colors) {
    assert.ok(!["#e20e28", "#015aaa", "#022a59", "#ef5a23"].includes(color.toLowerCase()), color);
  }
});

test("Missão é amarelo e preto, com nome e número legíveis", () => {
  const party = findParty("MISSÃO");
  const renan = findCandidate("renan-santos");

  assert.ok(party && renan);
  assert.equal(party.colors.primary.toLowerCase(), "#fdbf35");
  assert.equal(party.colors.secondary, "#000000");
  assert.equal(party.colors.accent, "#000000");

  const svg = buildFrameSvg(renan).toLowerCase();

  assert.ok(svg.includes('stroke="#fdbf35"'), "anel amarelo");
  assert.ok(svg.includes('fill="#000000"'), "texto preto sobre o amarelo");
});
