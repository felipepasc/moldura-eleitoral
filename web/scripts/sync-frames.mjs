import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = fileURLToPath(new URL("../../api/assets/frames", import.meta.url));
const target = fileURLToPath(new URL("../public/frames", import.meta.url));
const SMALL_SIZE = 480;

// Começa do zero: molduras de candidatos removidos (PNG e WebP) não ficam para trás.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
// Moldura com o símbolo do partido só vai para o site com PUBLISH_PARTY_FRAMES=true no build (e PARTY_STYLE_ENABLED=true na api).
const publishPartyFrames = process.env.PUBLISH_PARTY_FRAMES === "true";
await cp(source, target, { recursive: true, filter: (path) => publishPartyFrames || !path.endsWith("--partido.png") });

// Versões pequenas (480 px, WebP) para a home; o /criar continua usando o PNG de 1080 px.
const pngs = (await readdir(target)).filter((file) => file.endsWith(".png"));

await Promise.all(
  pngs.map(async (file) => {
    await sharp(`${target}/${file}`).resize(SMALL_SIZE, SMALL_SIZE).webp({ quality: 88, alphaQuality: 100 }).toFile(`${target}/${file.replace(/\.png$/, ".webp")}`);
  }),
);

console.log(`molduras copiadas para public/frames (${pngs.length} PNG + WebP ${SMALL_SIZE} px)`);
