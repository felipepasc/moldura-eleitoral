import { cp, mkdir } from "node:fs/promises";

await mkdir("public/frames", { recursive: true });
await cp("../api/assets/frames", "public/frames", { recursive: true });
console.log("molduras copiadas para public/frames");
