import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { CANDIDATES, FRAME_STYLES, frameFileName } from "@moldura/common";

const CELL = 420;
const LABEL = 56;
const GAP = 24;
const BACKGROUND = "#ffffff";

// Silhueta cinza neutra (cabeça e ombros) como a do site, só para a prévia.
const SILHOUETTE = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#d1d5db"/><circle cx="540" cy="450" r="170" fill="#9ca3af"/><ellipse cx="540" cy="900" rx="330" ry="260" fill="#9ca3af"/></svg>`;

// Gera a folha de prévia: linhas = candidatos, colunas = estilos, com o nome do estilo embaixo de cada moldura.
async function main() {
  const out = process.argv[2] ?? path.resolve("frames-estilos.png");
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><circle cx="540" cy="540" r="540" fill="#fff"/></svg>`);
  const silhouette = await sharp(Buffer.from(SILHOUETTE)).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const width = FRAME_STYLES.length * (CELL + GAP) + GAP;
  const height = CANDIDATES.length * (CELL + LABEL + GAP) + GAP;
  const layers: OverlayOptions[] = [];

  for (const [row, candidate] of CANDIDATES.entries()) {
    for (const [column, style] of FRAME_STYLES.entries()) {
      const left = GAP + column * (CELL + GAP);
      const top = GAP + row * (CELL + LABEL + GAP);
      // Usa as molduras curadas de assets/frames (as que vão para produção).
      const frame = await readFile(path.resolve("assets/frames", frameFileName(candidate.id, style.id)));
      const merged = await sharp(silhouette).composite([{ input: frame }]).png().toBuffer();
      const cell = await sharp(merged).resize(CELL, CELL).png().toBuffer();
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${LABEL}"><text x="${CELL / 2}" y="38" font-family="Arial, sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="#111827">${style.name}</text></svg>`);

      layers.push({ input: cell, left, top }, { input: label, left, top: top + CELL });
    }
  }

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, await sharp({ create: { width, height, channels: 3, background: BACKGROUND } }).composite(layers).png().toBuffer());
  console.log(out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
