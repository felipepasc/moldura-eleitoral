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

## API

- Multipart de `POST /orders`: os campos `candidateId` e `framing` precisam vir ANTES do arquivo `photo`.
- O id do pedido é a credencial do download: quem tem o id consegue ver o status e baixar a imagem paga.
- `TRUST_PROXY` é o número de proxies confiáveis na frente da api (0 = nenhum, o padrão; 1 = um proxy, e assim por diante). Com N saltos a api usa o endereço N posições a partir da direita do `X-Forwarded-For`, então o cliente não consegue forjar o IP. Os valores antigos `false`/`true` valem 0/1.

## Retenção de dados

A limpeza roda a cada hora (`cleanupOrders`) e apaga arquivo e registro:

- Pedidos `pending`/`expired`: após 24 h da criação (foto e linha).
- Pedidos `paid`: após 7 dias do pagamento (imagem final, foto que tenha sobrado e a linha inteira, incluindo IP e código Pix). Enquanto isso, qualquer `photoKey` que sobrou de uma remoção que falhou é apagada na hora.
- Pedidos `paid_failed` (cliente pagou e não recebeu a imagem): após 14 dias da criação, com um aviso `warn` no log (identificado só por um hash curto) para o operador.
- `webhook_events`: após 30 dias.

A regra de ciclo de vida do MinIO (`photos/` 2 dias, `results/` 8 dias) é só uma rede de segurança. Se ela não puder ser aplicada, a api apenas registra um aviso na subida: em produção, o operador precisa vigiar esse aviso.
