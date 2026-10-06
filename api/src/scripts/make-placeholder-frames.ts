import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES, FRAME_STYLES, frameFileName } from "@moldura/common";
import { EXEMPLO_FRAME, NEUTRAL_FRAME, renderPlaceholderFrame } from "@/scripts/placeholder-frame";

async function main() {
  const dir = path.resolve("assets/frames");
  await mkdir(dir, { recursive: true });

  for (const candidate of CANDIDATES) {
    for (const style of FRAME_STYLES) {
      const file = frameFileName(candidate.id, style.id);

      await writeFile(path.join(dir, file), await renderPlaceholderFrame(candidate, style.id));
      console.log(`ok ${file}`);
    }
  }

  for (const frame of [NEUTRAL_FRAME, EXEMPLO_FRAME]) {
    await writeFile(path.join(dir, `${frame.id}.png`), await renderPlaceholderFrame(frame));
    console.log(`ok ${frame.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
