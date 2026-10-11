import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES, CreateOrderSchema, PARTIES, findCandidate, findParty, frameFileName, frameHole, frameMaskFileName, frameStylesFor } from "@moldura/common";
import { buildMask, measureFrame } from "@/scripts/frame-assets";
import { EXEMPLO_FRAME, GENERATED_FRAMES, NEUTRAL_FRAME, PLACEHOLDER_STYLES, buildFrameSvg, missingGlyphs, renderPlaceholderFrame, validateFrame } from "@/scripts/placeholder-frame";

const FRAMES_DIR = path.resolve("assets/frames");
const MIN_PARTY_DISTANCE = 60;

function rgbDistance(a: string, b: string): number {
  const channels = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);

  return Math.hypot(ar - br, ag - bg, ab - bb);
}

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
  for (const style of PLACEHOLDER_STYLES) {
    test(`desenho ${style} de ${candidate.id}: só glifos, nome longo cabe e o selo não toca o disco`, async () => {
      const svg = buildFrameSvg(candidate, style);

      assert.ok(!svg.includes("<text"));
      assert.ok(!svg.includes("<image"));
      assert.deepEqual(await validateFrame(await renderPlaceholderFrame(candidate, style)), []);
    });
  }

  for (const style of frameStylesFor(candidate.id)) {
    const file = frameFileName(candidate.id, style.id);

    test(`assets/frames/${file} existe, tem máscara e o furo confere com o do common`, async () => {
      const sharp = (await import("sharp")).default;
      const frame = await readFile(path.join(FRAMES_DIR, file));
      const mask = await sharp(path.join(FRAMES_DIR, frameMaskFileName(candidate.id, style.id))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const measured = await measureFrame(frame);
      const hole = frameHole(candidate.id, style.id);

      assert.ok(hole, "furo declarado no common");
      assert.deepEqual(measured.hole, hole);
      assert.equal(mask.info.width, 1080);
      assert.equal(mask.info.height, 1080);

      // No meio do furo a moldura é transparente e a máscara deixa a foto aparecer.
      const middle = Math.round(hole.cy * 1080) * 1080 + Math.round(hole.cx * 1080);

      assert.equal(measured.alpha[middle], 0);
      assert.equal(mask.data[middle * 4 + 3], 255);

      // A máscara guardada é a que o frames:import geraria hoje.
      const rebuilt = await sharp(await buildMask(measured.inside)).raw().toBuffer();

      assert.ok(rebuilt.equals(mask.data), "máscara desatualizada: rode frames:import");
    });
  }
}

test("os modelos de cada candidato são imagens diferentes entre si", async () => {
  for (const candidate of CANDIDATES) {
    const files = await Promise.all(frameStylesFor(candidate.id).map((style) => readFile(path.join(FRAMES_DIR, frameFileName(candidate.id, style.id)))));

    assert.ok(files.length > 0, candidate.id);

    for (let first = 0; first < files.length; first += 1) {
      for (let second = first + 1; second < files.length; second += 1) {
        assert.ok(!files[first].equals(files[second]), `${candidate.id}: modelos ${first} e ${second} iguais`);
      }
    }
  }
});

test("a moldura neutra passa no validador, não tem número e não é candidato", async () => {
  const png = await readFile(path.join(FRAMES_DIR, `${NEUTRAL_FRAME.id}.png`));

  assert.deepEqual(await validateFrame(png), []);
  assert.equal(NEUTRAL_FRAME.id, "neutral");
  assert.equal(NEUTRAL_FRAME.number, undefined);
  assert.deepEqual(missingGlyphs(NEUTRAL_FRAME.frameName), []);
  assert.equal(findCandidate("neutral"), undefined);
  assert.ok(!CANDIDATES.some((candidate) => candidate.id === "neutral"));
  assert.equal(CreateOrderSchema.shape.candidateId.safeParse("neutral").success, false);
  assert.deepEqual(CANDIDATES.map((candidate) => candidate.id).sort(), ["flavio-bolsonaro", "lula"]);
});

for (const frame of [NEUTRAL_FRAME, EXEMPLO_FRAME]) {
  test(`a moldura ${frame.id} não usa as cores de nenhum partido`, () => {
    const svg = buildFrameSvg(frame).toLowerCase();

    assert.ok(svg.includes("<path"));
    assert.ok(!svg.includes("<text"));

    // Nenhuma cor da moldura pode ficar perto (distância RGB < 60) de qualquer cor de qualquer partido.
    for (const color of frame.colors) {
      for (const party of PARTIES) {
        for (const partyColor of [party.colors.primary, party.colors.secondary, party.colors.accent]) {
          assert.ok(rgbDistance(color, partyColor) >= MIN_PARTY_DISTANCE, `${color} parece ${party.acronym} ${partyColor}`);
        }
      }
    }
  });
}

test("a moldura de exemplo (\"SEU CANDIDATO\", 00) passa no validador e não é candidato", async () => {
  const png = await readFile(path.join(FRAMES_DIR, `${EXEMPLO_FRAME.id}.png`));

  assert.deepEqual(await validateFrame(png), []);
  assert.equal(EXEMPLO_FRAME.id, "exemplo");
  assert.equal(EXEMPLO_FRAME.frameName, "SEU CANDIDATO");
  assert.equal(EXEMPLO_FRAME.number, "00");
  assert.deepEqual(missingGlyphs(EXEMPLO_FRAME.frameName + "00"), []);
  assert.equal(findCandidate("exemplo"), undefined);
  assert.ok(!CANDIDATES.some((candidate) => candidate.id === "exemplo" || candidate.number === "00"));
  assert.equal(CreateOrderSchema.shape.candidateId.safeParse("exemplo").success, false);
});

test("o detector de cor de partido acusa uma paleta parecida", () => {
  assert.ok(rgbDistance("#ffdf00", "#ffdf00") < MIN_PARTY_DISTANCE);
  assert.ok(rgbDistance("#00843d", "#00923f") < MIN_PARTY_DISTANCE);
  assert.ok(rgbDistance("#6b7280", "#ffffff") >= MIN_PARTY_DISTANCE);
});

test("Missão é amarelo e preto, com nome e número legíveis", () => {
  const party = findParty("MISSÃO");

  assert.ok(party);
  assert.equal(party.colors.primary.toLowerCase(), "#fdbf35");
  assert.equal(party.colors.secondary, "#000000");
  assert.equal(party.colors.accent, "#000000");

  // Missão não está no 2º turno; o teste usa uma moldura avulsa com as cores do partido.
  const svg = buildFrameSvg({ id: "teste-missao", frameName: "TESTE", number: "14", colors: [party.colors.primary, party.colors.secondary, party.colors.accent] }).toLowerCase();

  assert.ok(svg.includes('stroke="#fdbf35"'), "anel amarelo");
  assert.ok(svg.includes('fill="#000000"'), "texto preto sobre o amarelo");
});

test("frames:build só gera a neutra e a de exemplo: nunca sobrescreve as molduras curadas dos candidatos", async () => {
  const candidateFiles = new Set(CANDIDATES.flatMap((candidate) => frameStylesFor(candidate.id).map((style) => frameFileName(candidate.id, style.id))));
  const targets = GENERATED_FRAMES.map((frame) => `${frame.id}.png`);

  assert.deepEqual(targets.sort(), ["exemplo.png", "neutral.png"]);

  for (const target of targets) {
    assert.ok(!candidateFiles.has(target), target);
  }

  const script = await readFile(path.resolve("src/scripts/make-placeholder-frames.ts"), "utf8");

  assert.ok(!script.includes("CANDIDATES"), "o script de build não pode iterar os candidatos");
  assert.ok(script.includes("GENERATED_FRAMES"));
});

test("assets/frames só tem as molduras em uso (nenhuma antiga fica para trás)", async () => {
  const curated = CANDIDATES.flatMap((candidate) => frameStylesFor(candidate.id).map((style) => frameFileName(candidate.id, style.id)));
  const expected = [...curated, ...GENERATED_FRAMES.map((frame) => `${frame.id}.png`)].sort();

  assert.deepEqual((await readdir(FRAMES_DIR)).filter((file) => file.endsWith(".png")).sort(), expected);
  assert.deepEqual((await readdir(path.join(FRAMES_DIR, "masks"))).sort(), [...curated].sort());
});
