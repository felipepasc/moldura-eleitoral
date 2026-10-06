// Status do site (GET /public/status da api: { salesEnabled, partyStyleEnabled }).
// Vendas: na dúvida, abertas (a api recusa com 503 se estiverem fechadas e o site mostra a mensagem dela).
// Estilo do partido: na dúvida, escondido (fail-closed; pode ser desligado por risco de marca).
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type SiteStatus = { salesOpen: boolean; partyStyleEnabled: boolean };

const FALLBACK: SiteStatus = { salesOpen: true, partyStyleEnabled: false };

export function parseSiteStatus(json: unknown): SiteStatus {
  if (!json || typeof json !== "object") {
    return { ...FALLBACK };
  }

  const record = json as Record<string, unknown>;

  return { salesOpen: record.salesEnabled !== false, partyStyleEnabled: record.partyStyleEnabled === true };
}

export async function loadSiteStatus(apiUrl: string, fetcher: FetchLike): Promise<SiteStatus> {
  try {
    const response = await fetcher(`${apiUrl}/public/status`, { cache: "no-store", referrerPolicy: "no-referrer" });

    if (!response.ok) {
      return { ...FALLBACK };
    }

    return parseSiteStatus(await response.json());
  } catch {
    return { ...FALLBACK };
  }
}
