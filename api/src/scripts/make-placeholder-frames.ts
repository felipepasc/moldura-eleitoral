import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED_FRAMES, renderPlaceholderFrame } from "@/scripts/placeholder-frame";

// Gera só a moldura neutra (prévia do /criar) e a de exemplo (topo da home).
// As molduras dos candidatos são curadas à mão em assets/frames e este script não toca nelas.
async function main() {
  const dir = path.resolve("assets/frames");
  await mkdir(dir, { recursive: true });

  for (const frame of GENERATED_FRAMES) {
    await writeFile(path.join(dir, `${frame.id}.png`), await renderPlaceholderFrame(frame));
    console.log(`ok ${frame.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
