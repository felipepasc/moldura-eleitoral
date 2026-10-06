// Janelas em que as vendas ficam fechadas automaticamente (ex.: dia da eleição).
// Formato: intervalos ISO-8601 "início/fim" com fuso explícito, separados por vírgula.
export const DEFAULT_SALES_BLACKOUT = "2026-10-25T00:00:00-03:00/2026-10-26T17:00:00-03:00";

export type Blackout = { start: number; end: number };

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function parseInstant(text: string, part: string): number {
  const value = text.trim();
  const time = ISO_WITH_OFFSET.test(value) ? Date.parse(value) : Number.NaN;

  if (Number.isNaN(time)) {
    throw new Error(`SALES_BLACKOUT inválida em "${part}": use início/fim em ISO-8601 com fuso (ex.: 2026-10-25T00:00:00-03:00/2026-10-26T17:00:00-03:00)`);
  }

  return time;
}

export function parseBlackout(value: string): Blackout[] {
  if (value.trim() === "") {
    return [];
  }

  return value.split(",").map((part) => {
    const pieces = part.split("/");

    if (pieces.length !== 2) {
      throw new Error(`SALES_BLACKOUT inválida em "${part.trim()}": cada intervalo precisa ser início/fim`);
    }

    const start = parseInstant(pieces[0] ?? "", part.trim());
    const end = parseInstant(pieces[1] ?? "", part.trim());

    if (end <= start) {
      throw new Error(`SALES_BLACKOUT inválida em "${part.trim()}": o fim precisa ser depois do início`);
    }

    return { start, end };
  });
}

// Início inclusivo, fim exclusivo.
export function isInBlackout(windows: Blackout[], now: Date): boolean {
  const time = now.getTime();

  return windows.some((window) => time >= window.start && time < window.end);
}
