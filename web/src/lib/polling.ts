export const POLL_BASE_MS = 3000;
export const POLL_MAX_MS = 15000;

export function nextDelay(current: number, succeeded: boolean): number {
  if (succeeded) {
    return POLL_BASE_MS;
  }

  return Math.min(current * 2, POLL_MAX_MS);
}

export function qrSource(brCodeBase64: string): string {
  return brCodeBase64.startsWith("data:image/") ? brCodeBase64 : `data:image/png;base64,${brCodeBase64}`;
}

const RETRY_AFTER_MIN_MS = 1000;
const RETRY_AFTER_MAX_MS = 120_000;

// Cabeçalho Retry-After (segundos inteiros ou data HTTP) em ms, limitado a 1–120 s; undefined se ausente/inválido.
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  const text = value?.trim() ?? "";

  if (!text) {
    return undefined;
  }

  let ms: number;

  if (/^\d+$/.test(text)) {
    ms = Number(text) * 1000;
  } else if (/^[A-Za-z]{3}, /.test(text) && !Number.isNaN(Date.parse(text))) {
    ms = Date.parse(text) - now;
  } else {
    return undefined;
  }

  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms));
}

export function retryDelay(backoff: number, retryAfterMs: number | undefined): number {
  return Math.max(backoff, retryAfterMs ?? 0);
}

// Depois do primeiro "expired", consulta mais algumas vezes: um Pix pago no último segundo ainda chega.
export const EXTRA_EXPIRED_POLLS = 3;

export function shouldKeepPolling(status: string, expiredPolls: number): boolean {
  if (status === "paid") {
    return false;
  }

  if (status === "expired") {
    return expiredPolls <= EXTRA_EXPIRED_POLLS;
  }

  return true;
}
