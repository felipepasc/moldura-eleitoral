import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import opentype from "opentype.js";
import type { Font } from "opentype.js";
import { FRAME_RING_RATIO, FRAME_SIZE, innerRadius } from "@moldura/common";
import type { Candidate } from "@moldura/common";

// Desenhos que o gerador sabe fazer (hoje só o clássico é usado, na neutra e na de exemplo).
export const PLACEHOLDER_STYLES = ["classica", "faixa", "listras", "fina", "ondas", "geometrica"] as const;
export type PlaceholderStyle = (typeof PLACEHOLDER_STYLES)[number];
const DEFAULT_PLACEHOLDER_STYLE: PlaceholderStyle = "classica";

// O que o desenho da moldura precisa: um candidato serve; a moldura neutra (sem número) também.
export type FrameSpec = Pick<Candidate, "id" | "frameName" | "colors"> & { number?: string };

// Moldura de exemplo da home: não é candidato (não está em CANDIDATES, não vai para /criar nem para pedidos).
// Paleta neutra (grafite e cinzas claros), longe de todas as cores de partido (testado); texto branco; sem selo de número.
export const NEUTRAL_FRAME: FrameSpec = { id: "neutral", frameName: "SUA FOTO AQUI", colors: ["#6b7280", "#cbd5e1", "#b4b4bb"] };

// Moldura de exemplo do topo da home (não é candidato): mesmos cinzas da neutra, "SEU CANDIDATO" e o número 00, que não existe na urna.
export const EXEMPLO_FRAME: FrameSpec = { id: "exemplo", frameName: "SEU CANDIDATO", number: "00", colors: ["#6b7280", "#cbd5e1", "#b4b4bb"] };

// As únicas molduras que `frames:build` gera. As dos candidatos são arquivos curados (feitos à parte) e nunca são sobrescritas.
export const GENERATED_FRAMES: readonly FrameSpec[] = [NEUTRAL_FRAME, EXEMPLO_FRAME];

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

type ArcTextOptions = {
  position?: "top" | "bottom";
  maxArcDegrees?: number;
  letterSpacing?: number;
  glyphTopLimit?: number;
};

// Texto em arco, glifo a glifo, como caminhos SVG (sem <text>): independe de fontes do sistema.
// No topo (padrão) lê da esquerda para a direita com o alto das letras para fora; embaixo, com o alto para o centro.
// Centrado; encolhe para caber em maxArcDegrees sem cortar.
function arcText(text: string, center: number, radius: number, requestedFontSize: number, fill: string, options: ArcTextOptions = {}): string {
  const { position = "top", maxArcDegrees = MAX_ARC_DEGREES, letterSpacing = LETTER_SPACING, glyphTopLimit = GLYPH_TOP_LIMIT } = options;
  const font = loadFont();
  const topFactor = /[^A-Z0-9 ]/.test(text) ? ACCENT_HEIGHT - CAP_HEIGHT / 2 : CAP_HEIGHT / 2;
  const maxFontSize = Math.min(requestedFontSize, (glyphTopLimit - radius) / topFactor);
  const characters = [...text];
  const maxArc = (maxArcDegrees * Math.PI * radius) / 180;
  const widthAt = (fontSize: number) => characters.reduce((sum, character) => sum + font.getAdvanceWidth(character, fontSize) + fontSize * letterSpacing, 0);
  const natural = widthAt(maxFontSize);
  const fontSize = natural > maxArc ? (maxFontSize * maxArc) / natural : maxFontSize;
  const total = widthAt(fontSize) - fontSize * letterSpacing;
  const bottom = position === "bottom";
  const baseline = bottom ? radius + (fontSize * CAP_HEIGHT) / 2 : radius - (fontSize * CAP_HEIGHT) / 2;
  let cursor = -total / 2;
  const paths: string[] = [];

  for (const character of characters) {
    const advance = font.getAdvanceWidth(character, fontSize);

    if (character !== " ") {
      const along = (cursor + advance / 2) / radius;
      const angle = bottom ? Math.PI - along : along;
      const x = center + baseline * Math.sin(angle);
      const y = center - baseline * Math.cos(angle);
      const rotation = bottom ? (angle * 180) / Math.PI - 180 : (angle * 180) / Math.PI;
      const data = font.getPath(character, -advance / 2, 0, fontSize).toPathData(2);

      paths.push(`<path transform="translate(${round(x)} ${round(y)}) rotate(${round(rotation)})" d="${data}" fill="${fill}"/>`);
    }

    cursor += advance + fontSize * letterSpacing;
  }

  return paths.join("");
}

function centeredText(text: string, x: number, y: number, fontSize: number, fill: string): string {
  const font = loadFont();
  const width = font.getAdvanceWidth(text, fontSize);
  const data = font.getPath(text, x - width / 2, y + (fontSize * CAP_HEIGHT) / 2, fontSize).toPathData(2);

  return `<path d="${data}" fill="${fill}"/>`;
}

function mix(hex: string, other: string, amount: number): string {
  const channel = (color: string, index: number) => Number.parseInt(color.slice(index, index + 2), 16);
  const channels = [1, 3, 5].map((index) => Math.round(channel(hex, index) * (1 - amount) + channel(other, index) * amount));

  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

const GEOMETRY = (() => {
  const size = FRAME_SIZE;
  const ring = size * FRAME_RING_RATIO;
  const inner = innerRadius(size);

  return { size, center: size / 2, ring, inner, middle: inner + ring / 2 };
})();

// Ponto do círculo: ângulo em graus a partir do topo, no sentido horário.
function polar(radius: number, degrees: number): { x: number; y: number } {
  const angle = (degrees * Math.PI) / 180;

  return { x: round(GEOMETRY.center + radius * Math.sin(angle)), y: round(GEOMETRY.center - radius * Math.cos(angle)) };
}

function point(radius: number, degrees: number): string {
  const { x, y } = polar(radius, degrees);

  return `${x} ${y}`;
}

// Setor de anel entre dois raios e dois ângulos (sentido horário).
function sectorPath(innerRadius: number, outerRadius: number, from: number, to: number): string {
  const large = to - from > 180 ? 1 : 0;

  return `M ${point(outerRadius, from)} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${point(outerRadius, to)} L ${point(innerRadius, to)} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${point(innerRadius, from)} Z`;
}

function ringBase(fill: string): string {
  const { center, ring, middle } = GEOMETRY;

  return `<circle cx="${center}" cy="${center}" r="${middle}" fill="none" stroke="${fill}" stroke-width="${ring}"/>`;
}

function outlineRing(color: string): string {
  const { center } = GEOMETRY;

  return `<circle cx="${center}" cy="${center}" r="${center - OUTLINE_WIDTH / 2}" fill="none" stroke="${color}" stroke-width="${OUTLINE_WIDTH}"/>`;
}

function svgWrap(content: string): string {
  const { size } = GEOMETRY;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">\n    ${content}\n  </svg>`;
}

function badgeAt(number: string, radius: number, fill: string, stroke: string, strokeWidth: number, textColor: string): string {
  const { center, middle } = GEOMETRY;
  const y = center + middle;

  return `<circle cx="${center}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>${centeredText(number, center, y, radius * 0.95, textColor)}`;
}

function classicaSvg(candidate: FrameSpec): string {
  const { size, center, ring, inner, middle } = GEOMETRY;
  const [main, second, third] = candidate.colors;
  const band = ring * 0.08;
  const badgeRadius = ring * 0.38;
  const outline = darken(main, 0.5);
  const nameColor = bestTextColor(main, [second, third, "#ffffff", "#000000"]);
  const badgeFill = bestTextColor(main, [second, third]);
  const numberColor = bestTextColor(badgeFill, [main, "#ffffff", "#000000"]);
  const badge = (number: string) => badgeAt(number, badgeRadius, badgeFill, main, size * 0.006, numberColor);

  return svgWrap(`${ringBase(main)}
    <circle cx="${center}" cy="${center}" r="${center - band / 2}" fill="none" stroke="${second}" stroke-width="${band}"/>
    <circle cx="${center}" cy="${center}" r="${inner + band / 2}" fill="none" stroke="${third}" stroke-width="${band}"/>
    ${outlineRing(outline)}
    ${arcText(candidate.frameName, center, middle, ring * 0.55, nameColor)}
    ${candidate.number === undefined ? "" : badge(candidate.number)}`);
}

// Faixa: anel na cor principal e uma fita curva embaixo (dobras em formas chapadas) com "NOME · NN".
function faixaSvg(candidate: FrameSpec): string {
  const { center, inner } = GEOMETRY;
  const [main, second, third] = candidate.colors;
  const ribbon = bestTextColor(main, [second, third]);
  const shade = darken(main, 0.35);
  const textColor = bestTextColor(ribbon, [main, "#ffffff", "#000000"]);
  const label = candidate.number === undefined ? candidate.frameName : `${candidate.frameName} · ${candidate.number}`;
  const rIn = inner + 16;
  const rOut = 522;
  const rMid = (rIn + rOut) / 2;
  const from = 108;
  const to = 252;
  const notch = 7;
  const tail = 10;
  const foldIn = rIn + 12;
  const foldOut = rOut - 12;
  const fold = (edge: number, direction: 1 | -1) => {
    const far = edge + direction * tail;

    return `<path d="M ${point(foldIn, edge)} L ${point(foldIn, far)} L ${point(rMid, far - direction * 2)} L ${point(foldOut, far)} L ${point(foldOut, edge)} Z" fill="${shade}"/>`;
  };
  const shape = `M ${point(rOut, from)} A ${rOut} ${rOut} 0 0 1 ${point(rOut, to)} L ${point(rMid, to - notch)} L ${point(rIn, to)} A ${rIn} ${rIn} 0 0 0 ${point(rIn, from)} L ${point(rMid, from + notch)} Z`;
  const wrapTriangle = (edge: number, direction: 1 | -1) =>
    `<path d="M ${point(foldIn, edge)} L ${point(foldIn - 10, edge)} L ${point(foldIn - 10, edge + direction * tail)} Z" fill="${darken(shade, 0.35)}"/>`;

  return svgWrap(`${ringBase(main)}
    <circle cx="${center}" cy="${center}" r="${inner + 7}" fill="none" stroke="${second}" stroke-width="4"/>
    <circle cx="${center}" cy="${center}" r="${538 - 7}" fill="none" stroke="${third}" stroke-width="4"/>
    ${outlineRing(darken(main, 0.5))}
    ${fold(from, -1)}${fold(to, 1)}
    <path d="${shape}" fill="${ribbon}"/>
    ${wrapTriangle(from, -1)}${wrapTriangle(to, 1)}
    ${arcText(label, center, rMid, 70, textColor, { position: "bottom", maxArcDegrees: 112, letterSpacing: 0.07, glyphTopLimit: 540 })}`);
}

// Listras: cunhas alternadas de principal e secundária, placa sólida no topo com o nome e selo embaixo.
function listrasSvg(candidate: FrameSpec): string {
  const { center, ring, inner, middle } = GEOMETRY;
  const [main, second, third] = candidate.colors;
  const stripe = 15;
  const wedges: string[] = [];

  for (let degrees = 0; degrees < 360; degrees += stripe * 2) {
    wedges.push(`<path d="${sectorPath(inner, center, degrees + stripe, degrees + stripe * 2)}" fill="${second}"/>`);
  }

  const edgeColor = bestTextColor(main, [second, third, "#ffffff"]);
  const plate = `<path d="${sectorPath(inner + 3, center - 3, -60, 60)}" fill="${main}" stroke="${edgeColor}" stroke-width="5" stroke-linejoin="round"/>`;
  const nameColor = bestTextColor(main, [second, third, "#ffffff", "#000000"]);

  return svgWrap(`${ringBase(main)}
    ${wedges.join("")}
    ${outlineRing(darken(main, 0.5))}
    ${plate}
    ${arcText(candidate.frameName, center, middle, ring * 0.55, nameColor, { maxArcDegrees: 98 })}
    ${candidate.number === undefined ? "" : badgeAt(candidate.number, ring * 0.4, main, edgeColor, 7, nameColor)}`);
}

// Fina: contorno externo de 14 px na cor principal, resto do anel em tom bem claro, nome e selo discretos.
function finaSvg(candidate: FrameSpec): string {
  const { center, ring, inner, middle } = GEOMETRY;
  const [main, second, third] = candidate.colors;
  const light = mix(main, "#ffffff", 0.92);
  const lineWidth = 14;
  const nameColor = [main, darken(main, 0.3), darken(main, 0.5), "#000000"].find((color) => contrast(color, light) >= 4.5) ?? "#000000";
  const badgeFill = nameColor;
  const badgeText = bestTextColor(badgeFill, ["#ffffff", "#000000"]);

  return svgWrap(`${ringBase(light)}
    <circle cx="${center}" cy="${center}" r="${center - lineWidth / 2}" fill="none" stroke="${main}" stroke-width="${lineWidth}"/>
    <circle cx="${center}" cy="${center}" r="${center - lineWidth - 5}" fill="none" stroke="${third}" stroke-width="3"/>
    <circle cx="${center}" cy="${center}" r="${inner + 3}" fill="none" stroke="${second === "#ffffff" ? main : second}" stroke-width="6"/>
    ${arcText(candidate.frameName, center, middle, ring * 0.46, nameColor, { letterSpacing: 0.16 })}
    ${candidate.number === undefined ? "" : badgeAt(candidate.number, ring * 0.3, badgeFill, light, 4, badgeText)}`);
}

// Raio de uma onda em função do ângulo (graus).
function waveRadius(base: number, amplitude: number, frequency: number, phase: number, degrees: number): number {
  return base + amplitude * Math.sin((degrees * Math.PI * frequency) / 180 + phase);
}

// Região do anel entre o furo e a fronteira da onda ("inside") ou entre a fronteira e a borda externa ("outside").
function waveFill(fill: string, boundary: (degrees: number) => number, side: "inside" | "outside"): string {
  const { center, inner } = GEOMETRY;
  const steps = 1080;
  const edge: string[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const degrees = (step * 360) / steps;

    edge.push(`${step === 0 ? "M" : "L"} ${point(boundary(degrees), degrees)}`);
  }

  const reference = side === "inside" ? inner : center;
  const circle = `M ${point(reference, 0)} A ${reference} ${reference} 0 1 1 ${point(reference, 180)} A ${reference} ${reference} 0 1 1 ${point(reference, 360)} Z`;

  return `<path d="${edge.join(" ")} Z ${circle}" fill="${fill}" fill-rule="evenodd"/>`;
}

// Ondas: camadas suaves de seno junto ao furo e à borda; faixa limpa no meio para o nome (topo) e o selo (embaixo).
function ondasSvg(candidate: FrameSpec): string {
  const { center, ring, inner } = GEOMETRY;
  const [main, second, third] = candidate.colors;
  const nameColor = bestTextColor(main, [second, third, "#ffffff", "#000000"]);
  const badgeFill = bestTextColor(main, [second, third, "#ffffff"]);
  const badgeText = bestTextColor(badgeFill, [main, "#ffffff", "#000000"]);
  const front = darken(main, 0.3);
  const waves = [
    waveFill(third, (degrees) => waveRadius(inner + 38, 7, 18, 0.0, degrees), "inside"),
    waveFill(second, (degrees) => waveRadius(inner + 27, 7, 18, 0.9, degrees), "inside"),
    waveFill(front, (degrees) => waveRadius(inner + 16, 7, 18, 1.8, degrees), "inside"),
    waveFill(third, (degrees) => waveRadius(center - 20, 5, 18, 0.5, degrees), "outside"),
    waveFill(second, (degrees) => waveRadius(center - 10, 4, 18, 1.4, degrees), "outside"),
  ];

  return svgWrap(`${ringBase(main)}
    ${waves.join("\n    ")}
    ${outlineRing(darken(main, 0.5))}
    ${arcText(candidate.frameName, center, inner + ring * 0.58, ring * 0.42, nameColor, { glyphTopLimit: 520 })}
    ${candidate.number === undefined ? "" : badgeAt(candidate.number, ring * 0.36, badgeFill, main, 6, badgeText)}`);
}

// Geométrica: base na cor principal com trilhas de bolinhas e triângulos nas bordas e chevrons no meio;
// o topo (nome) e o fundo (selo) ficam sem padrão.
function geometricaSvg(candidate: FrameSpec): string {
  const { center, ring, inner, middle } = GEOMETRY;
  const [main, second, third] = candidate.colors;
  const nameColor = bestTextColor(main, [second, third, "#ffffff", "#000000"]);
  const badgeFill = bestTextColor(main, [second, third, "#ffffff"]);
  const badgeText = bestTextColor(badgeFill, [main, "#ffffff", "#000000"]);
  const dotColor = bestTextColor(main, [second, third]);
  const otherColor = dotColor === second ? third : second;
  const trackIn = inner + 14;
  const trackOut = center - 14;
  const items: string[] = [];
  const step = 5;
  const clear = (degrees: number, topHalf: number, bottomHalf: number) => Math.abs(((degrees + 180) % 360) - 180) > topHalf && Math.abs(degrees - 180) > bottomHalf;
  const dot = (radius: number, degrees: number) => {
    const { x, y } = polar(radius, degrees);

    return `<circle cx="${x}" cy="${y}" r="6.5" fill="${dotColor}"/>`;
  };
  const triangle = (radius: number, degrees: number, direction: 1 | -1) => {
    const tip = point(radius + direction * 11, degrees);
    const left = point(radius - direction * 8, degrees - 2.1);
    const right = point(radius - direction * 8, degrees + 2.1);

    return `<path d="M ${tip} L ${left} L ${right} Z" fill="${otherColor}"/>`;
  };

  for (let degrees = 0; degrees < 360; degrees += step) {
    if (!clear(degrees, 62, 20)) {
      continue;
    }

    const even = (degrees / step) % 2 === 0;

    items.push(even ? dot(trackIn, degrees) : triangle(trackIn, degrees, 1));
    items.push(even ? triangle(trackOut, degrees, -1) : dot(trackOut, degrees));
  }

  for (let degrees = 0; degrees < 360; degrees += 10) {
    if (!clear(degrees, 62, 24)) {
      continue;
    }

    const tip = point(middle + 16, degrees);
    const left = point(middle - 10, degrees - 3.4);
    const right = point(middle - 10, degrees + 3.4);

    items.push(`<path d="M ${left} L ${tip} L ${right}" fill="none" stroke="${dotColor}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  return svgWrap(`${ringBase(main)}
    ${items.join("\n    ")}
    ${outlineRing(darken(main, 0.5))}
    ${arcText(candidate.frameName, center, middle, ring * 0.55, nameColor, { maxArcDegrees: 112 })}
    ${candidate.number === undefined ? "" : badgeAt(candidate.number, ring * 0.38, badgeFill, main, 6, badgeText)}`);
}

export function buildFrameSvg(candidate: FrameSpec, style: PlaceholderStyle = DEFAULT_PLACEHOLDER_STYLE): string {
  const missing = missingGlyphs(candidate.frameName + (candidate.number ?? "") + "·");

  if (missing.length > 0) {
    throw new Error(`A fonte da moldura não tem glifo para: ${missing.join(" ")} (${candidate.id})`);
  }

  switch (style) {
    case "faixa":
      return faixaSvg(candidate);
    case "listras":
      return listrasSvg(candidate);
    case "fina":
      return finaSvg(candidate);
    case "ondas":
      return ondasSvg(candidate);
    case "geometrica":
      return geometricaSvg(candidate);
    default:
      return classicaSvg(candidate);
  }
}

export async function renderPlaceholderFrame(candidate: FrameSpec, style: PlaceholderStyle = DEFAULT_PLACEHOLDER_STYLE): Promise<Buffer> {
  return sharp(Buffer.from(buildFrameSvg(candidate, style))).png().toBuffer();
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
