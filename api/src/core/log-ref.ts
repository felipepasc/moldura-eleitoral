import { createHash } from "node:crypto";

export function orderRef(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}
