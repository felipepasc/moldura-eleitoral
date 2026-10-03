import { findCandidate } from "@moldura/common";

export type SavedOrder = { id: string; candidateId: string; savedAt: number };
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const MY_ORDERS_KEY = "moldura:orders:v1";
export const MY_ORDERS_TTL_MS = 7 * 24 * 3600 * 1000;
export const MY_ORDERS_MAX = 20;

const CLOCK_SKEW_MS = 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function toSavedOrder(value: unknown, now: number): SavedOrder | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { id, candidateId, savedAt } = value as Record<string, unknown>;

  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return null;
  }

  if (typeof candidateId !== "string" || !findCandidate(candidateId)) {
    return null;
  }

  if (typeof savedAt !== "number" || !Number.isFinite(savedAt) || savedAt > now + CLOCK_SKEW_MS || now - savedAt >= MY_ORDERS_TTL_MS) {
    return null;
  }

  return { id, candidateId, savedAt };
}

function write(storage: KeyValueStorage, orders: SavedOrder[]): void {
  try {
    storage.setItem(MY_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // Cota cheia ou armazenamento bloqueado: segue sem guardar.
  }
}

function drop(storage: KeyValueStorage): void {
  try {
    storage.removeItem(MY_ORDERS_KEY);
  } catch {
    // Sem acesso ao armazenamento: nada a fazer.
  }
}

export function loadSavedOrders(storage: KeyValueStorage | null, now: number): SavedOrder[] {
  if (!storage) {
    return [];
  }

  let raw: string | null;

  try {
    raw = storage.getItem(MY_ORDERS_KEY);
  } catch {
    return [];
  }

  if (raw === null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    drop(storage);

    return [];
  }

  if (!Array.isArray(parsed)) {
    drop(storage);

    return [];
  }

  const seen = new Set<string>();
  const valid: SavedOrder[] = [];

  for (const item of parsed) {
    const order = toSavedOrder(item, now);

    if (order && !seen.has(order.id)) {
      seen.add(order.id);
      valid.push(order);
    }
  }

  valid.sort((a, b) => b.savedAt - a.savedAt);

  const kept = valid.slice(0, MY_ORDERS_MAX);
  const original = JSON.stringify(parsed);

  if (JSON.stringify(kept) !== original) {
    write(storage, kept);
  }

  return kept;
}

export function saveOrder(storage: KeyValueStorage | null, order: { id: string; candidateId: string }, now: number): void {
  if (!storage) {
    return;
  }

  const candidate = toSavedOrder({ id: order.id, candidateId: order.candidateId, savedAt: now }, now);

  if (!candidate) {
    return;
  }

  const current = loadSavedOrders(storage, now);

  if (current.some((entry) => entry.id === candidate.id)) {
    return;
  }

  write(storage, [candidate, ...current].slice(0, MY_ORDERS_MAX));
}

export function removeSavedOrder(storage: KeyValueStorage | null, id: string, now: number): void {
  if (!storage) {
    return;
  }

  const current = loadSavedOrders(storage, now);

  write(storage, current.filter((entry) => entry.id !== id));
}

export function clearSavedOrders(storage: KeyValueStorage | null): void {
  if (storage) {
    drop(storage);
  }
}
