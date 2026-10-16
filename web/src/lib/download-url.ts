import { normalizeOrigin } from "./origin";

export type DownloadDecision = { kind: "remove" } | { kind: "unavailable" } | { kind: "ok"; url: string };

// Defesa em profundidade: só usa a URL de download se for http/https e da origem configurada
// (comparação exata depois de normalizar: localhost != 127.0.0.1). Sem origem válida configurada, recusa.
export function safeDownloadUrl(value: string, imagesOrigin: string | undefined): string | null {
  const allowed = normalizeOrigin(imagesOrigin, "");

  if (!allowed) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  return url.origin === allowed ? value : null;
}

// Só a resposta da api decide apagar a entrada local (pedido que não está pago ou sem link).
// Um link inutilizável (origem errada, esquema estranho) deixa o cartão indisponível, mas NÃO apaga nada.
export function decideDownload(status: string, downloadUrl: string | null, imagesOrigin: string | undefined): DownloadDecision {
  if (status !== "paid" || !downloadUrl) {
    return { kind: "remove" };
  }

  const url = safeDownloadUrl(downloadUrl, imagesOrigin);

  return url ? { kind: "ok", url } : { kind: "unavailable" };
}

// O link assinado vale DOWNLOAD_URL_SECONDS (5 min): com mais de 4 min, busca outro antes de baixar.
export const DOWNLOAD_URL_FRESH_MS = 4 * 60 * 1000;

export function isDownloadStale(fetchedAt: number, now: number): boolean {
  return !(now - fetchedAt >= 0 && now - fetchedAt < DOWNLOAD_URL_FRESH_MS);
}
