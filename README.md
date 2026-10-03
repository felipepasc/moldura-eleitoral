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
- `TRUST_PROXY` é o número de proxies confiáveis na frente da api (0 = nenhum, o padrão; 1 = um proxy, e assim por diante). A api só deve ser alcançável pelo proxy, numa rede privada: o par direto precisa ter endereço privado/loopback (127/8, 10/8, 172.16/12, 192.168/16, ::1, fc00::/7, fe80::/10), senão o `X-Forwarded-For` é ignorado. Com N saltos a api usa o endereço N posições a partir da direita do cabeçalho. Os valores antigos `false`/`true` valem 0/1.

## Retenção de dados

A limpeza roda a cada hora (`cleanupOrders`) e apaga arquivo e registro:

- Pedidos `pending`/`expired`: após 24 h da criação. Antes de apagar, a limpeza reconsulta o Pix na AbacatePay (se pagou, o pedido segue as regras de pago; se a AbacatePay estiver fora do ar, o pedido é pulado e tentado na hora seguinte). A linha é apagada primeiro e a foto depois; se a foto não puder ser removida, sai um aviso de foto órfã e a regra do MinIO (2 dias) é a rede de segurança.
- Pedidos `paid`: após 7 dias do pagamento (ou da criação, se não houver data de pagamento). Imagem final e foto que tenha sobrado são removidas primeiro; a linha inteira (IP, código Pix) só é apagada se todas as remoções deram certo, senão tenta de novo na hora seguinte. Qualquer `photoKey` que sobrou de uma remoção que falhou é apagada na hora.
- Pedidos `paid_failed` (cliente pagou e não recebeu a imagem): após 3 dias da criação, com um aviso `warn` no log (identificado só por um hash curto) depois do apagamento. Como a foto some do MinIO em 2 dias (regra de ciclo de vida de `photos/`), o operador precisa agir (reembolso ou remontagem) dentro desses 2 dias.
- `webhook_events`: após 30 dias.
- A limpeza roda uma vez na subida da api e depois a cada hora.

A regra de ciclo de vida do MinIO (`photos/` 2 dias, `results/` 8 dias) é só uma rede de segurança. Se ela não puder ser aplicada, a api apenas registra um aviso na subida: em produção, o operador precisa vigiar esse aviso.
