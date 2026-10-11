import type { CSSProperties } from "react";

// Recorta um elemento pela máscara da moldura (PNG cujo alfa diz onde a foto aparece).
export function maskStyle(src: string | null): CSSProperties | undefined {
  if (!src) {
    return undefined;
  }

  return { WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` };
}
