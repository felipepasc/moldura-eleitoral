# Moldura Eleitoral — design

Data: 2026-10-03

## Objetivo

Site em que a pessoa envia a própria foto, escolhe a moldura de um candidato das eleições 2026 e **paga R$ 3,99 (Pix, AbacatePay)** para baixar a foto pronta, sem marca d'água. Referência visual: o print da home enviado pelo dono (hero, exemplos de molduras, "Como funciona").

Sucesso = um visitante, sem login e sem informar CPF, envia a foto, vê a prévia, paga o Pix e baixa o PNG limpo; a versão limpa nunca chega ao navegador antes do pagamento confirmado.

## Decisões já tomadas

- Cobrança: por **baixar a foto pronta** (prévia grátis com marca d'água).
- Gateway: **AbacatePay**, só Pix.
- Montagem final **no servidor**, só depois de pago.
- Molduras: geradas **uma vez** pelo Codex (imagem), fixas no repositório. Nenhuma IA roda por cliente.
- Stack: monorepo pnpm como o CRM Automotivo — `common`, `api`, `web` — com Postgres e MinIO, **sem RabbitMQ**.
- Convenções do CRM (imports com `@/`, `common` com imports relativos, identificadores em inglês, textos em português, Zod como fonte única, helpers `ok/created/badReq...`) seguem valendo.

## Pacotes

```
moldura eleitoral/
├── common/   schemas Zod + lista de candidatos (compila para dist)
├── api/      Fastify + Drizzle + Postgres + MinIO + sharp
│   └── assets/frames/<candidato>.png   moldura com centro transparente
├── web/      Next.js (App Router)
├── docker-compose.yml   Postgres + MinIO
└── pnpm-workspace.yaml
```

### common
- `CandidateSchema`/lista fixa: `id`, `name`, `number`, cores.
- `CreateOrderSchema` (candidato, enquadramento `{ zoom, offsetX, offsetY }`; a foto vai como multipart), `OrderSchema`, `OrderStatus`.

### api
- `modules/orders/`: `routes/orders.router.ts`, `services/` (criação, confirmação, montagem), `schema.ts` (tabelas).
- `modules/payments/`: cliente da AbacatePay, rota do webhook.
- `core/`: `db`, `env`, `logger`, `storage` (MinIO), `http-fastify`, rate-limit.
- Rotas: `POST /orders`, `GET /orders/:id`, `POST /webhooks/abacatepay`, `GET /healthz`.

### web
- Home como o print: hero, exemplos (cards dos candidatos, com silhueta genérica — **sem rostos ou fotos de pessoas reais**), "Como funciona".
- Página de criar: upload, escolha da moldura, zoom/arrastar, prévia com marca d'água (canvas, só no navegador).
- Tela de pagamento: QR code, copia-e-cola, polling de 3 s em `GET /orders/:id`, botão de baixar quando pago.

## Fluxo

1. Cliente escolhe candidato, envia a foto, ajusta o enquadramento; vê a prévia (marca d'água) no navegador.
2. Clica em Baixar: `POST /orders` (multipart). A `api` valida tipo/tamanho, redimensiona a foto, guarda no MinIO (bucket privado), cria o pedido `pending` e chama a AbacatePay para criar o Pix de **399 centavos**, `expiresIn` 30 min. Responde com id do pedido, `brCode` e `brCodeBase64`.
3. A `web` faz polling em `GET /orders/:id` a cada 3 s.
4. A AbacatePay chama `POST /webhooks/abacatepay?webhookSecret=...`. A `api`:
   - compara o segredo em tempo constante (401 se errado);
   - registra o evento em `webhook_events` (`INSERT ... ON CONFLICT DO NOTHING`); duplicado → 200 `{ duplicate: true }`;
   - **reconsulta** o status do Pix na AbacatePay (nunca confia só no webhook);
   - se `PAID`, executa `confirmOrder`;
   - responde sempre 200 depois de registrar o evento.
5. `confirmOrder` (idempotente): lê a foto do MinIO, aplica recorte circular + enquadramento + moldura com `sharp`, grava o PNG final no MinIO e marca o pedido `paid`. Se a montagem falhar, marca `paid_failed` (dinheiro entrou; a montagem pode ser refeita).
6. `GET /orders/:id` também consulta a AbacatePay se o pedido estiver `pending` e chama `confirmOrder` se vier `PAID` (cobre atraso do webhook); expira localmente se passou de `expiresAt`. Quando `paid`, devolve URL assinada do MinIO de curta duração.

## Estados do pedido

`pending → paid`, `pending → expired`, `pending → paid_failed → paid` (remontagem). Sem estorno, sem `failed`.

## Dados

- `orders`: `id`, `status`, `candidateId`, `photoKey`, `framing` (json), `pixId`, `resultKey`, `ipAddress`, `createdAt`, `paidAt`, `expiresAt`.
- `webhook_events`: `eventId` (PK), `event`, `payload`, `processedAt`.
- Nenhum dado pessoal além da foto e do IP.

## Integração AbacatePay (a confirmar na doc oficial no plano)

Base observada no `talkify-app` (API v2): `https://api.abacatepay.com/v2`, `Authorization: Bearer <chave>`.
- Criar: `POST /transparents/create` com `{ method: "PIX", data: { amount, description, expiresIn } }` → `id`, `brCode`, `brCodeBase64`, `expiresAt`.
- Consultar: `GET /transparents/check?id=` → `PENDING | PAID | EXPIRED | CANCELLED | REFUNDED`.
- Eventos de pago aceitos: `transparent.completed`, `billing.paid`, `checkout.completed`.
- Chave só na `api`; dev/sandbox é definido pela chave usada. O `/v2` e os campos acima foram vistos no código do talkify, não na doc — **verificar antes de implementar**.

## Segurança, limites e limpeza

- Foto: só imagem (jpeg/png/webp), máx. ~8 MB, redimensionada no servidor.
- Rate-limit de `POST /orders` por IP.
- Bucket privado; download por URL assinada curta.
- Rotina interna na `api` (sem fila): apaga foto de pedido não pago após 24 h e imagem pronta após 7 dias.
- Segredos só em `.env` (`.env.example` sem valores): chave da AbacatePay, segredo do webhook, credenciais do MinIO e do banco.

## Testes (`*.check.ts`, estilo do CRM, AbacatePay simulada)

- Webhook sem/ com segredo errado → 401; duplicado → idempotente; reconsulta devolvendo `PENDING` não confirma.
- `confirmOrder` chamado duas vezes gera uma só imagem.
- Montagem: saída 1080×1080 PNG com a moldura sobreposta.
- Expiração de `pending`; `paid_failed` e remontagem.

## Fora do escopo

Login/contas, painel admin, estorno, outros meios de pagamento, geração de moldura por IA em tempo real, RabbitMQ.

## Riscos e pendências

- Jurídico: cobrar por material de apoio eleitoral e usar nomes de candidatos pode ter regras da Justiça Eleitoral; validar com advogado eleitoral antes de lançar. Site se declara independente e não oficial.
- Molduras do Codex: precisam ser geradas e revisadas (centro realmente transparente, sem rostos); o plano inclui a etapa de geração e conferência.
- Segredo do webhook na query string é fraco; mitigado pela reconsulta à AbacatePay.
- Hospedagem (ex.: Coolify) e domínio ainda não definidos.
