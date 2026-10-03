import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import opentype from "opentype.js";
import type { Font } from "opentype.js";
import { FRAME_RING_RATIO, FRAME_SIZE, innerRadius } from "@moldura/common";
import type { Candidate } from "@moldura/common";

// O que o desenho da moldura precisa: um candidato serve; a moldura neutra (sem número) também.
export type FrameSpec = Pick<Candidate, "id" | "frameName" | "colors"> & { number?: string };

// Moldura de exemplo da home: não é candidato (não está em CANDIDATES, não vai para /criar nem para pedidos).
// Paleta neutra (grafite e cinzas claros), longe de todas as cores de partido (testado); texto branco; sem selo de número.
export const NEUTRAL_FRAME: FrameSpec = { id: "neutral", frameName: "SUA FOTO AQUI", colors: ["#6b7280", "#cbd5e1", "#b4b4bb"] };

const FONT_URL = new URL("../../assets/fonts/montserrat-latin-800-normal.woff", import.meta.url);
const MAX_ARC_DEGREES = 100;
const LETTER_SPACING = 0.09;
const ACCENT_HEIGHT = 0.95;
const GLYPH_TOP_LIMIT = 524;
const OUTLINE_WIDTH = 3;
const CAP_HEIGHT = 0.7;

let cachedFont: Font | undefined;

function loadFont(): Font {
  if (!cachedFont) {
    const file = readFileSync(fileURLToPath(FONT_URL));
    cachedFont = opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  }

  return cachedFont;
}

// Caracteres do texto que a fonte não cobre (glifo .notdef). Vazio quando tudo é desenhável.
export function missingGlyphs(text: string): string[] {
  const font = loadFont();

  return [...text].filter((character) => character !== " " && font.charToGlyph(character).index === 0);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));

  return (high + 0.05) / (low + 0.05);
}

function bestTextColor(background: string, options: string[]): string {
  return [...options].sort((first, second) => contrast(second, background) - contrast(first, background))[0];
}

function darken(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((index) => Math.round(Number.parseInt(hex.slice(index, index + 2), 16) * (1 - amount)));

  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Texto em arco, glifo a glifo, como caminhos SVG (sem <text>): independe de fontes do sistema.
// Centrado no topo do anel; encolhe para caber em MAX_ARC_DEGREES sem cortar.
function arcText(text: string, center: number, radius: number, requestedFontSize: number, fill: string): string {
  const font = loadFont();
  const topFactor = /[^A-Z0-9 ]/.test(text) ? ACCENT_HEIGHT - CAP_HEIGHT / 2 : CAP_HEIGHT / 2;
  const maxFontSize = Math.min(requestedFontSize, (GLYPH_TOP_LIMIT - radius) / topFactor);
  const characters = [...text];
  const maxArc = (MAX_ARC_DEGREES * Math.PI * radius) / 180;
  const widthAt = (fontSize: number) => characters.reduce((sum, character) => sum + font.getAdvanceWidth(character, fontSize) + fontSize * LETTER_SPACING, 0);
  const natural = widthAt(maxFontSize);
  const fontSize = natural > maxArc ? (maxFontSize * maxArc) / natural : maxFontSize;
  const total = widthAt(fontSize) - fontSize * LETTER_SPACING;
  const baseline = radius - (fontSize * CAP_HEIGHT) / 2;
  let cursor = -total / 2;
  const paths: string[] = [];

  for (const character of characters) {
    const advance = font.getAdvanceWidth(character, fontSize);

    if (character !== " ") {
      const angle = (cursor + advance / 2) / radius;
      const x = center + baseline * Math.sin(angle);
      const y = center - baseline * Math.cos(angle);
      const data = font.getPath(character, -advance / 2, 0, fontSize).toPathData(2);

      paths.push(`<path transform="translate(${round(x)} ${round(y)}) rotate(${round((angle * 180) / Math.PI)})" d="${data}" fill="${fill}"/>`);
    }

    cursor += advance + fontSize * LETTER_SPACING;
  }

  return paths.join("");
}

function centeredText(text: string, x: number, y: number, fontSize: number, fill: string): string {
  const font = loadFont();
  const width = font.getAdvanceWidth(text, fontSize);
  const data = font.getPath(text, x - width / 2, y + (fontSize * CAP_HEIGHT) / 2, fontSize).toPathData(2);

  return `<path d="${data}" fill="${fill}"/>`;
}

export function buildFrameSvg(candidate: FrameSpec): string {
  const missing = missingGlyphs(candidate.frameName + (candidate.number ?? ""));

  if (missing.length > 0) {
    throw new Error(`A fonte da moldura não tem glifo para: ${missing.join(" ")} (${candidate.id})`);
  }

  const size = FRAME_SIZE;
  const center = size / 2;
  const ring = size * FRAME_RING_RATIO;
  const inner = innerRadius(size);
  const middle = inner + ring / 2;
  const [main, second, third] = candidate.colors;
  const band = ring * 0.08;
  const badgeRadius = ring * 0.38;
  const outline = darken(main, 0.5);
  const badgeY = center + middle;
  const nameColor = bestTextColor(main, [second, third, "#ffffff", "#000000"]);
  const badgeFill = bestTextColor(main, [second, third]);
  const numberColor = bestTextColor(badgeFill, [main, "#ffffff", "#000000"]);
  const badge = (number: string) =>
    `<circle cx="${center}" cy="${badgeY}" r="${badgeRadius}" fill="${badgeFill}" stroke="${main}" stroke-width="${size * 0.006}"/>${centeredText(number, center, badgeY, badgeRadius * 0.95, numberColor)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${center}" cy="${center}" r="${middle}" fill="none" stroke="${main}" stroke-width="${ring}"/>
    <circle cx="${center}" cy="${center}" r="${center - band / 2}" fill="none" stroke="${second}" stroke-width="${band}"/>
    <circle cx="${center}" cy="${center}" r="${inner + band / 2}" fill="none" stroke="${third}" stroke-width="${band}"/>
    <circle cx="${center}" cy="${center}" r="${center - OUTLINE_WIDTH / 2}" fill="none" stroke="${outline}" stroke-width="${OUTLINE_WIDTH}"/>
    ${arcText(candidate.frameName, center, middle, ring * 0.55, nameColor)}
    ${candidate.number === undefined ? "" : badge(candidate.number)}
  </svg>`;
}

export async function renderPlaceholderFrame(candidate: FrameSpec): Promise<Buffer> {
  return sharp(Buffer.from(buildFrameSvg(candidate))).png().toBuffer();
}

export async function validateFrame(png: Buffer): Promise<string[]> {
  const problems: string[] = [];
  const meta = await sharp(png).metadata();

  if (meta.width !== FRAME_SIZE || meta.height !== FRAME_SIZE) {
    problems.push(`tamanho ${meta.width}x${meta.height}, esperado ${FRAME_SIZE}x${FRAME_SIZE}`);

    return problems;
  }

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  const center = FRAME_SIZE / 2;
  const inner = innerRadius();
  let opaqueInDisc = 0;

  for (let y = 0; y < FRAME_SIZE; y += 20) {
    for (let x = 0; x < FRAME_SIZE; x += 20) {
      if (Math.hypot(x - center, y - center) < 390 && alphaAt(x, y) !== 0) {
        opaqueInDisc += 1;
      }
    }
  }

  if (opaqueInDisc > 0 || alphaAt(center, center) !== 0) {
    problems.push("o disco central não é totalmente transparente");
  }

  const last = FRAME_SIZE - 3;
  const corners = [alphaAt(2, 2), alphaAt(last, 2), alphaAt(2, last), alphaAt(last, last)];

  if (corners.some((alpha) => alpha !== 0)) {
    problems.push("algum canto não é transparente");
  }

  const ringRadius = inner + (center - inner) / 2;
  const weakAngles: number[] = [];

  for (let step = 0; step < 8; step += 1) {
    const angle = (step * Math.PI) / 4;
    const x = Math.round(center + ringRadius * Math.sin(angle));
    const y = Math.round(center - ringRadius * Math.cos(angle));

    if (alphaAt(x, y) < 250) {
      weakAngles.push(step * 45);
    }
  }

  if (weakAngles.length > 0) {
    problems.push(`o anel não é opaco nos ângulos ${weakAngles.join(", ")}`);
  }

  return problems;
}
