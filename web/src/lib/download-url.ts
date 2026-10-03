// Defesa em profundidade: só usa a URL de download se for http/https e, quando a origem das imagens
// estiver configurada, da mesma origem (comparação exata: localhost != 127.0.0.1).
export function safeDownloadUrl(value: string, imagesOrigin: string | undefined): string | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (imagesOrigin && url.origin !== imagesOrigin) {
    return null;
  }

  return value;
}
