import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES } from "@moldura/common";
import { renderPlaceholderFrame } from "@/scripts/placeholder-frame";

async function main() {
  const dir = path.resolve("assets/frames");
  await mkdir(dir, { recursive: true });

  for (const candidate of CANDIDATES) {
    const png = await renderPlaceholderFrame(candidate);
    await writeFile(path.join(dir, `${candidate.id}.png`), png);
    console.log(`ok ${candidate.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
