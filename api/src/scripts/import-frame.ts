import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildMask, maskFileName, measureFrame, resizeFrame } from "@/scripts/frame-assets";

// Uso: pnpm frames:import <arte.png> <arquivo-da-moldura.png>
// Grava a moldura em 1080 px e a máscara da foto em assets/frames, e mostra o furo para colar em common/src/frame-styles.ts.
async function main() {
  const [source, target] = process.argv.slice(2);

  if (!source || !target || !target.endsWith(".png")) {
    throw new Error("Uso: frames:import <arte.png> <arquivo-da-moldura.png>");
  }

  const directory = path.resolve("assets/frames");
  const frame = await resizeFrame(await readFile(source));
  const { hole, inside } = await measureFrame(frame);

  await mkdir(path.join(directory, "masks"), { recursive: true });
  await writeFile(path.join(directory, target), frame);
  await writeFile(path.join(directory, maskFileName(target)), await buildMask(inside));

  console.log(`${target}: hole ${JSON.stringify(hole)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
