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
