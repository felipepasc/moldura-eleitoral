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
