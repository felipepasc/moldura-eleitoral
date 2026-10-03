export const DEFAULT_API_ORIGIN = "http://localhost:6600";
export const DEFAULT_IMAGES_ORIGIN = "http://localhost:9300";

// Normaliza uma origem configurada (`new URL(x).origin`). Usa `??`: só `undefined` cai no padrão;
// texto vazio, lixo ou protocolo que não seja http/https viram "" (origem não configurada).
// O CSP (next.config.ts) e a checagem do link no navegador usam esta mesma função.
export function normalizeOrigin(raw: string | undefined, fallback: string): string {
  try {
    const url = new URL(raw ?? fallback);

    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

// URL base da api: aceita caminho (ex.: https://site/api), mas sem query/hash e sem barras finais,
// para `${base}/orders` nunca virar `//orders`. Sem caminho, é só a origem normalizada.
export function normalizeApiUrl(raw: string | undefined, fallback: string): string {
  const value = (raw ?? fallback).trim();

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    const path = url.pathname.replace(/\/+$/, "");

    return path ? `${url.origin}${path}` : normalizeOrigin(value, fallback);
  } catch {
    return "";
  }
}
