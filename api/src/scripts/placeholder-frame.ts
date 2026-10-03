import sharp from "sharp";
import { FRAME_RING_RATIO, FRAME_SIZE, innerRadius } from "@moldura/common";
import type { Candidate } from "@moldura/common";
import { pixelAt } from "@/scripts/fixtures/pixels";

function arcPath(center: number, radius: number, startAngle: number, endAngle: number): string {
  const startX = center + radius * Math.cos(startAngle);
  const startY = center + radius * Math.sin(startAngle);
  const endX = center + radius * Math.cos(endAngle);
  const endY = center + radius * Math.sin(endAngle);

  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
}

export async function renderPlaceholderFrame(candidate: Candidate): Promise<Buffer> {
  const size = FRAME_SIZE;
  const center = size / 2;
  const ring = size * FRAME_RING_RATIO;
  const inner = innerRadius(size);
  const middle = inner + ring / 2;
  const badge = size * 0.11;
  const [main, second, third] = candidate.colors;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${center}" cy="${center}" r="${middle}" fill="none" stroke="${main}" stroke-width="${ring}"/>
    <path d="${arcPath(center, center - ring * 0.16, Math.PI * 0.05, Math.PI * 0.55)}" fill="none" stroke="${second}" stroke-width="${ring * 0.32}"/>
    <path d="${arcPath(center, inner + ring * 0.16, Math.PI * 0.05, Math.PI * 0.55)}" fill="none" stroke="${third}" stroke-width="${ring * 0.32}"/>
    <circle cx="${center}" cy="${size - badge * 0.95}" r="${badge}" fill="${main}" stroke="#ffffff" stroke-width="${size * 0.012}"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function validateFrame(png: Buffer): Promise<string[]> {
  const problems: string[] = [];
  const meta = await sharp(png).metadata();

  if (meta.width !== FRAME_SIZE || meta.height !== FRAME_SIZE) {
    problems.push(`tamanho ${meta.width}x${meta.height}, esperado ${FRAME_SIZE}x${FRAME_SIZE}`);

    return problems;
  }

  const center = FRAME_SIZE / 2;
  const centerPixel = await pixelAt(png, center, center);
  const cornerPixel = await pixelAt(png, 2, 2);
  const ringPixel = await pixelAt(png, center, Math.round(center - innerRadius() - 20));

  if (centerPixel.a !== 0) {
    problems.push("o centro não é transparente");
  }

  if (cornerPixel.a !== 0) {
    problems.push("o canto não é transparente");
  }

  if (ringPixel.a < 250) {
    problems.push("o anel não é opaco no topo");
  }

  return problems;
}
