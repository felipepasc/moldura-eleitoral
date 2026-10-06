// Status de vendas (GET /public/status da api: { salesEnabled }). Na dúvida, aberto: a api recusa
// o pedido com 503 se as vendas estiverem fechadas, e o site mostra a mensagem dela.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function parseSalesStatus(json: unknown): boolean {
  if (json && typeof json === "object" && "salesEnabled" in json && json.salesEnabled === false) {
    return false;
  }

  return true;
}

export async function loadSalesStatus(apiUrl: string, fetcher: FetchLike): Promise<boolean> {
  try {
    const response = await fetcher(`${apiUrl}/public/status`, { cache: "no-store", referrerPolicy: "no-referrer" });

    if (!response.ok) {
      return true;
    }

    return parseSalesStatus(await response.json());
  } catch {
    return true;
  }
}
