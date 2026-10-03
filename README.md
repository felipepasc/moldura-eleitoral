# Moldura Eleitoral

Monorepo: `common` (schemas), `api` (Fastify), `web` (Next.js).

Rodar infra local: `docker compose up -d` (precisa do Docker Desktop aberto).

## AbacatePay (docs)

Conferido em docs.abacatepay.com (API v2, `https://api.abacatepay.com/v2`):

- A API documenta 9 status: PENDING, PAID, EXPIRED, CANCELLED, REFUNDED, FAILED, UNDER_DISPUTE, APPROVED, REDEEMED. O cliente mapeia PENDING, PAID, EXPIRED, CANCELLED e REFUNDED para eles mesmos, FAILED para CANCELLED e todo o resto (UNDER_DISPUTE, APPROVED, REDEEMED, valores desconhecidos) para PENDING. Só o literal PAID vira PAID.
- Evento de webhook de Pix pago: `transparent.completed` (também existem `transparent.refunded`, `transparent.disputed`, `transparent.lost`).
- O webhook traz o header `X-Webhook-Signature` (HMAC-SHA256 do corpo bruto com a chave pública da AbacatePay). Não dependemos dele: confiamos no segredo na query (`?webhookSecret=`) e sempre reconsultamos o status do Pix na API antes de marcar como pago.
- `brCodeBase64` pode vir com o prefixo `data:image/png;base64,`.
- Os campos dentro de `data` do webhook `transparent.completed` não foram confirmados.
