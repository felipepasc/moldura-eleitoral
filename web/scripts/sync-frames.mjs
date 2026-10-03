import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../api/assets/frames", import.meta.url));
const target = fileURLToPath(new URL("../public/frames", import.meta.url));

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log("molduras copiadas para public/frames");
