# Manual de operação

> Documento de quando o site estava em produção (outubro de 2026). O projeto foi encerrado; o resumo está no [README](../README.md).

Monorepo pnpm: `common` (schemas e candidatos), `api` (Fastify + Postgres + MinIO + sharp), `web` (Next.js).
O cliente vê a prévia grátis (com marca d'água), paga R$ 2,99 por Pix (pelo Core) e baixa o PNG sem marca d'água, montado no servidor depois do pagamento.

## Rodar local

1. `docker compose up -d` (Docker Desktop aberto): Postgres :5440 e MinIO :9300 (console :9301), ambos só em 127.0.0.1.
2. `pnpm install`
3. `api/.env`: copie de `api/.env.example` e preencha `CORE_API_KEY` e `CORE_WEBHOOK_SECRET` (chave de um serviço de teste no Core; veja a seção Pix pelo Core) e deixe `SALES_ENABLED=true` (sem valor as vendas ficam fechadas). `web/.env.local`: copie de `web/.env.example` (`NEXT_PUBLIC_API_URL`).
   Os arquivos `.env*` ficam fora do git (só `.env.example` e `.env.test` são versionados). Nunca commite segredos. Esta pasta está no OneDrive: mantenha o `api/.env` fora de pastas sincronizadas ou exclua-o da sincronização.
4. `pnpm --filter @moldura/api db:setup`
5. `pnpm dev:api` (http://localhost:6600) e `pnpm dev:web` (http://localhost:6610). O `dev:web` copia as molduras para `web/public/frames` antes de subir.

`web/AGENTS.md` (gerado pelo Next) avisa que esta versão do Next tem mudanças incompatíveis; consulte `web/node_modules/next/dist/docs/` antes de mexer no web.

## Testes

`pnpm test` (precisa do Postgres do passo 1; cria o banco `moldura_test` sozinho) e `pnpm typecheck`. Os testes da api usam armazenamento em memória; o MinIO real só entra no uso local/E2E.

## Molduras

As molduras dos candidatos são **arquivos curados** (arte pronta, de formato livre), um por candidato e modelo, em `api/assets/frames/`: `<id>.png` para o Modelo 1 (o que a home mostra) e `<id>--modelo-N.png` para os demais (`frameFileName` em `common/src/frame-styles.ts`). Os modelos são numerados (`FRAME_STYLES`: `modelo-1` a `modelo-6`) e cada candidato tem a sua quantidade (`frameStylesFor`): Lula 6, Flávio Bolsonaro 5. Como o furo não é um círculo no centro, cada moldura tem uma **máscara** (`api/assets/frames/masks/<mesmo nome>.png`, PNG branco cujo alfa diz onde a foto aparece) e a medida do **furo** (`FRAME_HOLES` em `common/src/frame-styles.ts`), que posiciona a foto. A api (`composeImage`) e a prévia do site usam as duas. Todas têm 1080×1080, PNG RGBA.
- Para trocar ou acrescentar uma moldura: `pnpm --filter @moldura/api frames:import <arte.png> <nome-do-arquivo.png>` grava a moldura em 1080 px e a máscara, e mostra o furo; cole o furo em `FRAME_HOLES` (na posição do modelo). Depois rode `pnpm --filter @moldura/api test` (o `frames.check.ts` confere moldura, máscara e furo de cada candidato × modelo, e acusa arquivo sobrando) e `pnpm --filter @moldura/api frames:sheet [saida.png] [foto]` para ver a folha de prévia montada como em produção.
- `pnpm frames:build` (alias de `frames:placeholder`) **só** gera a moldura neutra (`neutral.png`, prévia do `/criar`) e a de exemplo (`exemplo.png`, topo da home) com o desenhador de glifos (sem `<text>`); ele nunca sobrescreve as molduras curadas dos candidatos (testado).
- O web (`sync-frames.mjs`) copia os PNG de 1080 (usados na prévia do `/criar` e na montagem da api) e gera um WebP de 480 px de cada um (miniaturas e home).
- No `/criar`, depois de escolher o candidato aparecem os modelos dele como miniaturas (grupo de rádio, setas/Home/End); a prévia usa o PNG e a máscara do candidato + modelo, e o pagamento só libera com os dois carregados. Link direto: `/criar?c=<id>&e=<modelo>` (modelo inválido, ou que o candidato não tem, vira o Modelo 1; isso vale para os links dos estilos antigos). O pedido envia `frameStyle` depois de `candidateId`, `framing` e `consent` e antes da foto; a api recusa (400) modelo que o candidato não tem, e pedidos antigos com estilo que não existe mais são montados com o Modelo 1.
Os arquivos públicos `/frames/<id>.png` (servidos pelo web) são as molduras **sem** marca d'água, de propósito: são só o anel decorativo, sem a foto do cliente. A marca d'água existe apenas na prévia do navegador.

## Dados dos candidatos e partidos

- Partidos: `common/src/parties.ts` (sigla, nome, número e três cores; sem logotipos). Os hex vêm de pesquisa em sites oficiais e Wikipédia em 03/10/2026; `colorsEstimated: true` marca cores que não vieram de manual de identidade (todas, exceto Solidariedade). PV e PCB não tiveram hex verificado e usam valores razoáveis. PMB agora é "Democrata" (35), PMN é "Mobiliza" (33); União Brasil (44) e PP (11) formam federação, mas mantêm número próprio.
- Candidatos: `common/src/candidates.ts` com **só os dois candidatos do 2º turno de 2026: Lula (PT, 13) e Flávio Bolsonaro (PL, 22)**. Conferir no DivulgaCand antes de publicar. As cores de cada candidato são derivadas do partido; `PARTIES` continua com todos os partidos.
- O site oferece **só molduras dos candidatos a presidente do 2º turno** (decisão do produto); governadores não são oferecidos. O modelo de dados continua pronto caso isso mude: `office` em `candidates.ts`, `common/src/states.ts` (27 UFs) e `candidatesBy(office, state)`.
- Só dados públicos (nomes, números, partidos, cores): nada de e-mail, telefone, CPF ou endereço.

## Página inicial e ilustrações de IA

- A home (`web/src/app/page.tsx` + `web/src/components/home/`) é toda animada só com CSS (`@keyframes` de `transform`/`opacity`) e um `Reveal` com `IntersectionObserver`; sem biblioteca de animação, sem fontes, imagens ou scripts externos (o CSP não mudou). Com `prefers-reduced-motion: reduce` tudo fica parado no estado final e o avatar do topo não troca.
- Ilustrações: `web/public/art/<id>.webp` (640×640), **estilizadas e geradas por IA** — não são fotos nem material oficial. Só entram as aprovadas; ao aprovar uma nova, copie o arquivo e acrescente o id em `ART_IDS` (`web/src/lib/art.ts`). Sem ilustração, o cartão mostra uma silhueta genérica com a moldura por cima.
- Toda ilustração mostra o selo `AiBadge` ("IA", `aria-label` "Ilustração gerada por IA") no canto superior direito, e o aviso "Ilustrações geradas por IA, estilizadas — não são fotos nem material oficial das campanhas." aparece perto do topo da home e no rodapé. O selo é só para a arte do site: nunca vai sobre a foto do usuário.
- Topo neutro: o hero mostra só três pessoas fictícias (ilustrações de IA, com selo) na moldura de exemplo cinza "SEU CANDIDATO" / 00 (`exemplo.png`, que não é candidato), trocando a cada 4 s; com movimento reduzido fica na primeira. Nenhum candidato ou cor de partido aparece no topo. Os cartões e o `<select>` do `/criar` seguem a ordem alfabética (`sortCandidatesAlphabetically`). Sem `?c=` válido, o `/criar` não escolhe ninguém: mostra "Escolha uma moldura…", a moldura neutra com a silhueta e o botão de pagar fica desabilitado até escolher.
- "Exemplos de molduras" mostra os dois candidatos do 2º turno em ordem alfabética; em `/criar` o seletor de moldura é uma lista simples deles (Flávio Bolsonaro, Lula).
- Consentimento (LGPD art. 11, dado sensível: a moldura revela preferência política): em `/criar` o pagamento só libera com duas caixas marcadas (autorização do tratamento da foto e da moldura e declaração de 18 anos ou mais / autorização do responsável). O web envia `consent=true` no multipart (depois de `candidateId` e `framing`, antes da foto); a api recusa sem ele com 400 "Confirme o consentimento para continuar." (`CreateOrderSchema.consent`).
- Vendas abertas/fechadas: `/criar` consulta uma vez `GET /public/status` (`{ salesEnabled }`, sem cache); se `false`, a prévia continua funcionando, o botão mostra "Vendas abertas em breve" e aparece "As vendas estão fechadas no momento."; se a consulta falhar, o site trata como aberto (a api recusa com 503 se estiver fechado).
- A home não tem mais a faixa de partidos; os cartões dos candidatos mostram o Modelo 1 e a quantidade de modelos do candidato, e levam a `/criar?c=<id>`.
- `web/scripts/sync-frames.mjs` (predev/prebuild) copia os PNG de 1080 px e gera `public/frames/<id>.webp` de 480 px com `sharp` (devDependency do web); a home usa o WebP e o `/criar` continua com o PNG, que o canvas da prévia precisa.
- Teste dos helpers: `pnpm test` (roda também os `web/src/lib/*.check.ts`).

## Proteção da prévia

O que protege de verdade é o servidor: a foto final, sem marca d'água e em 1080 px, só é montada na api depois do Pix pago. O navegador nunca recebe a imagem limpa e o código do web não exporta canvas (sem `toDataURL`, `toBlob` ou `captureStream`).

Na prévia (`/criar`) há, além disso:
- Marca d'água densa em duas grades cruzadas (−30° e +30°) com "PRÉVIA • NÃO PAGO", por cima da foto e da moldura; `web/src/lib/watermark.ts` tem a geometria e o teste garante que todo recorte de 15% × 15% contém marca. A foto continua visível para posicionar.
- Resolução menor: o canvas da prévia tem 540 × 540 (`PREVIEW_SIZE`); o enquadramento é guardado em frações, então o pedido enviado é o mesmo e o servidor compõe em 1080.
- Atrito (só ajuda, não impede): bloqueio de menu de contexto, arrastar e seleção na prévia; na impressão a prévia some e aparece um aviso; nos atalhos de captura do sistema (PrintScreen, Win/Cmd+Shift+S, Cmd+Shift+3/4/5) a prévia fica preta por ~1,5 s e tenta limpar a área de transferência; em computador, a prévia escurece enquanto a janela está sem foco ou oculta e volta no foco ou ao mexer o mouse.

A prévia de 540 px é ampliada na tela, então fica um pouco suave em telas de alta densidade (de propósito). No Windows, o PrintScreen é capturado pelo sistema antes de a página reagir; escurecer e limpar a área de transferência (no keyup) é só tentativa.

O que isso NÃO impede: print pelo botão do celular, gravadores de tela, ferramentas do sistema que não passam pelo navegador, câmera apontada para a tela. Uma página web não consegue detectar nem bloquear capturas de forma confiável (tela preta em print só existe com vídeo com DRM ou app nativo). Por isso o site não promete isso; a prévia é só de baixa resolução e marcada.

## Privacidade e termos (web)

- `/privacidade` e `/termos` (links no rodapé) descrevem o que o site realmente faz: foto enviada só ao clicar em "Baixar foto pronta", prazos de exclusão, Pix pelo Core sem pedir nome/CPF, IP não guardado (só em memória para limitar abusos), lista "Minhas molduras" no localStorage, sem cookies, análise, anúncios ou rastreadores. **Os textos são um rascunho inicial e precisam ser revisados pelo advogado do operador antes do lançamento.** Se a api mudar prazos ou dados guardados, atualize as duas páginas.
- Variáveis do web (lidas no build; veja `web/.env.example`, que traz os valores de produção aprovados): `NEXT_PUBLIC_OPERATOR_NAME` (razão social), `NEXT_PUBLIC_OPERATOR_DOC` (CNPJ) e `NEXT_PUBLIC_CONTACT_EMAIL` (e-mail para LGPD e problemas com pagamento). A identificação aparece no rodapé de todas as páginas e no bloco de operador de `/privacidade` e `/termos`. Sem nome e e-mail, o rodapé e as páginas omitem o bloco e o build mostra um aviso. Endereço físico ainda não é exibido (decisão pendente do dono).
- `/privacidade` informa o armazenamento na Cloudflare R2 (transferência internacional, LGPD art. 33), os operadores (Cloudflare, instituição de pagamento, hospedagem), o registro financeiro da venda no nosso sistema financeiro (Core) e o consentimento.
- Cabeçalhos do web: CSP, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, sem `X-Powered-By`; `Strict-Transport-Security` só em produção.
- `pnpm test` também roda os testes dos helpers do web (`web/src/lib/*.check.ts`, via `tsx --test`).

### Fonte das molduras

O texto das molduras usa a Montserrat ExtraBold (subconjunto latin, `api/assets/fonts/montserrat-latin-800-normal.woff`, extraída do pacote npm `@fontsource/montserrat`, que não é dependência do projeto), licenciada sob a SIL Open Font License 1.1; o texto da licença está em `api/assets/fonts/Montserrat-OFL.txt`. O `opentype.js` (devDependency da api) converte os glifos em caminhos SVG.

## Pix pelo Core

A api não fala com nenhum provedor de pagamento: ela usa o `@felipepasc/core-sdk` (npm público) e o Core (`https://felipepasc.com`) gera o Pix no provedor configurado no CNPJ do serviço. Nada de nota fiscal: só cobrança e Pix.

- Pedido novo: `charges.upsert(<referência>)` com um cliente genérico ("Cliente Moldura Eleitoral"), um item "Moldura Eleitoral" de R$ 2,99 (`PRICE_CENTS`) e vencimento no dia (Brasília), depois `charges.createPayment(<referência>, { method: "pix" })`. A referência é aleatória (32 hex), nunca o id do pedido (a credencial do download); o Core nunca recebe foto, candidato nem dado do comprador. O QR é gerado na api a partir do copia e cola (sem a imagem do provedor). Pix com outro valor ou sem copia e cola é recusado.
- Consulta: `charges.get(<referência>)`. Só `paid` libera; `canceled` expira; o resto (inclusive estorno, que volta para `open`) é pendente.
- A cobrança paga vira receita do serviço no Core sozinha (lançamento `charge:<referência>`): não mande `revenue_cents` nem lançamento para o mesmo dinheiro.
- Aviso: `POST https://<api>/webhooks/core`, evento `charge.paid`, assinado no padrão Standard Webhooks (`verifyWebhook` do SDK, janela de 5 min). Assinatura errada, ausente ou velha devolve 400 e nada é gravado. Mesmo com assinatura válida, a api reconsulta a cobrança antes de liberar o pedido; se ainda não estiver paga (ou o Core falhar), responde 503 e o Core repete (2 s, 4 s, 8 s… para sempre). A entrega é idempotente pelo id do aviso. Sem aviso, o polling da tela do pedido também libera.
- Variáveis: `CORE_API_KEY` (`fk_...`, do serviço "Moldura Eleitoral" no Core, aba Integração; só aparece na criação), `CORE_WEBHOOK_SECRET` (`whsec_...`), `CORE_API_URL` (`https://felipepasc.com`). As duas primeiras são obrigatórias: sem elas a api não sobe.
- Cadastrar o aviso (uma vez por ambiente): `CORE_API_KEY=fk_... pnpm --filter @moldura/api core:webhook https://api.molduraeleitoral.com`. O segredo sai uma vez, numa linha `CORE_WEBHOOK_SECRET=...`: ponha direto no ambiente da api.
- Na subida a api chama `ping` e loga o nome do serviço do Core (confira que é o da Moldura, não outro). O `.npmrc` da raiz força o `@felipepasc` no npm público (ignora um `~/.npmrc` antigo do GitHub Packages).
- Taxas e saque seguem o contrato do provedor da empresa no Core; pergunte ao suporte se o uso eleitoral é permitido e guarde a resposta.

## API

- Multipart de `POST /orders`: os campos `candidateId` e `framing` precisam vir ANTES do arquivo `photo`.
- Limites: `POST /orders` 10 por minuto por IP; `GET /orders/:id` 300 por minuto por IP; a api só reconsulta o Core no máximo a cada 5 s por pedido (o webhook sempre força), e refaz a montagem de um `paid_failed` no máximo a cada 30 s.
- Só JPEG, PNG e WebP são aceitos, conferidos pelos bytes iniciais antes de a foto chegar ao sharp. Toda resposta leva `X-Content-Type-Options: nosniff`.
- O id do pedido é a credencial do download: quem tem o id consegue ver o status e baixar a imagem paga.
- `TRUST_PROXY` é o número de proxies confiáveis na frente da api (0 = nenhum, o padrão; 1 = um proxy, e assim por diante). A api só deve ser alcançável pelo proxy, numa rede privada: o par direto precisa ter endereço privado/loopback (127/8, 10/8, 172.16/12, 192.168/16, ::1, fc00::/7, fe80::/10), senão o `X-Forwarded-For` é ignorado. Com N saltos a api usa o endereço N posições a partir da direita do cabeçalho. Os valores antigos `false`/`true` valem 0/1.

## Retenção de dados

IP não é gravado; usado só em memória para limitar requisições (o banco não tem coluna de IP). Depois de um deploy, `db:setup` aplica a migração que removeu `orders.ip_address`.

A limpeza roda uma vez na subida da api e depois a cada hora (`cleanupOrders`, sem execuções sobrepostas):

- Pedidos `pending`/`expired`: após 24 h da criação. Antes de apagar, a limpeza reconsulta a cobrança no Core (se pagou, o pedido segue as regras de pago; se a consulta falhar, o pedido é pulado e tentado na hora seguinte). A linha é apagada com condição de status (nunca apaga um pedido que acabou de pagar) e a foto depois; se a foto não puder ser removida, sai um aviso de foto órfã e a regra do MinIO (4 dias) é a rede de segurança.
- Teto independente do Core: pedido `pending`/`expired` com mais de 3 dias é apagado mesmo que a consulta continue falhando (chave trocada, URL errada, 401/403/404).
- Se esse apagamento por teto acontecer com a consulta falhando, o log traz o aviso "Pedido não pago apagado pelo teto sem confirmação" com `pixId` e `orderRef`: o cliente pode ter pago sem a api saber.
- Pedidos `paid`: após 7 dias do pagamento (ou da criação, se não houver data de pagamento). Imagem final e foto que tenha sobrado são removidas primeiro; a linha inteira (Pix, enquadramento) só é apagada se todas as remoções deram certo, senão tenta de novo na hora seguinte. Qualquer `photoKey` que sobrou de uma remoção que falhou é apagada na hora.
- Pedidos `paid_failed` (cliente pagou e não recebeu a imagem): após 3 dias da criação (com o Core respondendo); teto de 5 dias mesmo com o Core fora do ar. O apagamento registra o aviso "Pedido pago sem imagem apagado" com o `pixId` (ver o roteiro abaixo).
- `webhook_events`: após 30 dias.

A regra de ciclo de vida do MinIO (`photos/` 4 dias, `results/` 8 dias) é só uma rede de segurança; a expiração é avaliada por dia (arredondada para a meia-noite UTC e aplicada por um varredor em segundo plano), então 4 e 8 dias são limites superiores com até ~1 dia de folga (a limpeza normalmente apaga a foto em 24 h ou no pagamento). Se ela não puder ser aplicada, a api apenas registra o aviso "Não consegui configurar a expiração automática do bucket" na subida: em produção, o operador precisa vigiar esse aviso. Como a foto some do MinIO em 4 dias, um `paid_failed` não pode mais ser remontado depois disso: aja antes.

### Roteiro do operador: pedido pago sem imagem

0. Mesmo roteiro para "Pedido não pago apagado pelo teto sem confirmação": procure a cobrança pelo `pixId` (é o externalId dela) no Core; se estiver paga, reembolse.
1. Procure no log da api a mensagem "Pedido pago sem imagem" (quando a montagem falha) ou "Pedido pago sem imagem apagado" (quando a limpeza remove o pedido). Os dois eventos trazem `orderRef` (hash curto, serve só para achar o pedido nos logs) e `pixId` (o id da cobrança). São (com o aviso de teto sem confirmação) os únicos logs que contêm o `pixId`.
2. No Core (`/dashboard/faturamento/cobrancas`), localize a cobrança por esse `pixId`, faça o reembolso no painel do provedor e reabra/cancele a cobrança no Core.
3. O pedido não precisa de mais nada: a limpeza apaga a linha sozinha (3 a 5 dias).

## Minhas molduras

Depois do pagamento, o navegador guarda em `localStorage` (chave `moldura:orders:v1`) só o id do pedido, o candidato e a data, por 7 dias (máximo 20). Nunca a foto, o Pix ou o link de download. A página `/minhas` busca de novo cada imagem na api, que gera um link assinado novo a cada abertura. Há botões para apagar um item ou tudo.

- Risco: o id do pedido funciona como credencial do download. Quem tiver acesso ao navegador vê as molduras; em computador compartilhado, apague ao terminar. Apagar a lista não basta: o histórico do navegador guarda o endereço `/pedido/<id>`, e quem abrir esse endereço vê a imagem por 7 dias (e a página guarda o pedido de novo). Por isso, em computador compartilhado, apague também o histórico do navegador ou use uma aba anônima; na tela do pedido há o botão "Não guardar neste aparelho". Entradas inválidas, expiradas ou de pedidos que a api não conhece mais são removidas sozinhas.
- O site envia `Content-Security-Policy` (ver `web/next.config.ts`): scripts e estilos só do próprio site (`'unsafe-inline'` é exigido pelo Next sem nonces), imagens do próprio site e da origem do MinIO, conexões só para a api.
- Em produção defina `NEXT_PUBLIC_IMAGES_ORIGIN` (origem pública do MinIO, ex.: `https://files.exemplo.com.br`) e `NEXT_PUBLIC_API_URL` **antes do build**: os dois entram no CSP e no código do navegador. `NEXT_PUBLIC_IMAGES_ORIGIN` precisa ser igual, caractere por caractere, à origem dos links assinados (`localhost` é diferente de `127.0.0.1`); se for diferente, o CSP bloqueia a imagem e a página `/minhas` descarta o link. O valor é fixado no build, e o build avisa se ele estiver vazio ou inválido.

## Produção (Coolify + Cloudflare)

Domínios: `molduraeleitoral.com` e `www.molduraeleitoral.com` (web), `api.molduraeleitoral.com` (api). Os downloads saem do endpoint S3 do Cloudflare R2 (`https://<account_id>.r2.cloudflarestorage.com/<bucket>/results/<uuid>.png?X-Amz-...`, link assinado de curta duração). Duas aplicações no Coolify, build pack **Dockerfile**, contexto = raiz do repositório:

- **api**: `Dockerfile` (raiz), porta 6600, healthcheck `/healthz`. Ao subir, roda as migrações (`db:setup`, que só confere `pg_database` e migra: funciona com um papel sem `CREATEDB` se o banco já existir) e inicia a api.
- **web**: `deploy/web.Dockerfile`, porta 6610.

### Variáveis da api (runtime)

- Obrigatórias: `DATABASE_URL`, `WEB_ORIGIN` (`https://molduraeleitoral.com,https://www.molduraeleitoral.com`: lista separada por vírgula, cada item é normalizado e só elas passam no CORS), `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_REGION`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `CORE_API_KEY`, `CORE_WEBHOOK_SECRET`, `TRUST_PROXY`, `SALES_ENABLED` (sem valor as vendas ficam FECHADAS).
- Opcionais: `PORT` (6600), `LOG_LEVEL` (`info`; `warn` reduz o volume), `CORE_API_URL` (`https://felipepasc.com`).
- R2: `MINIO_ENDPOINT=<account_id>.r2.cloudflarestorage.com`, `MINIO_PORT=443`, `MINIO_USE_SSL=true`, `MINIO_REGION=auto`, `MINIO_BUCKET=<bucket>`, chaves de um token S3 do R2 com permissão de leitura/escrita no bucket (e, se possível, de ciclo de vida). O bucket já deve existir: a api só o cria se faltar. A api tenta aplicar a regra de expiração (`photos/` 4 dias, `results/` 8 dias); se o R2 recusar, só registra o aviso "Não consegui configurar a expiração automática do bucket" (configure a regra no painel do R2). Os links assinados usam path-style e a região `auto`.
- `TRUST_PROXY=2`: o caminho é Cloudflare, depois Traefik (Coolify), depois a api. O `X-Forwarded-For` chega como `<cliente>, <IP da Cloudflare>`; com 2 saltos a api descarta os dois últimos e usa o cliente, e o par direto (o Traefik) precisa estar em rede privada. Isso só é seguro se o servidor de origem aceitar conexões **apenas dos IPs da Cloudflare** (firewall/Security Group); caso contrário alguém pode falar direto com o Traefik e forjar o cabeçalho. O IP é usado só em memória, para o limite de requisições. Confirme no ambiente real.
- Aviso do Core: `https://api.molduraeleitoral.com/webhooks/core` (evento `charge.paid`, cadastrado com `core:webhook`; a autenticação é a assinatura HMAC, então a URL não leva segredo). Também aceitamos `www`: a Cloudflare faz 301 de `www` para o apex, e o CORS aceita os dois.

### Variáveis do web (build args: valem no BUILD, não no runtime)

`NEXT_PUBLIC_API_URL` (`https://api.molduraeleitoral.com`), `NEXT_PUBLIC_IMAGES_ORIGIN` (`https://<account_id>.r2.cloudflarestorage.com`, igual caractere por caractere à origem dos links assinados), `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_OPERATOR_DOC`, `NEXT_PUBLIC_CONTACT_EMAIL`. No Coolify, marque-as como "Build Variable". Mudou um valor: refaça o build.

### Abrir e fechar as vendas

`SALES_ENABLED=true` abre e `false` fecha (o padrão em dev/testes é `true`; em produção comece com `false`). Mude a variável no Coolify e reinicie/redeploye a api. Fechado, `POST /orders` devolve 503 "As vendas estão fechadas no momento." antes de ler a foto, e `GET /public/status` devolve `{ "salesEnabled": false }` (o web lê esse endpoint). Pedidos já criados continuam sendo pagos, consultados e limpos normalmente.

**Blackout automático** (`SALES_BLACKOUT`): lista de intervalos `início/fim` em ISO-8601 com fuso explícito, separados por vírgula, por exemplo `2026-10-25T00:00:00-03:00/2026-10-26T17:00:00-03:00`. As vendas só ficam abertas quando `SALES_ENABLED=true` **e** o horário atual está fora de todos os intervalos (início inclusivo, fim exclusivo). Sem a variável vale o padrão acima (dia da eleição do 2º turno, até 17h de terça); string vazia desliga o blackout; valor inválido impede a api de subir, com mensagem clara. Durante a janela `POST /orders` devolve 503 e `GET /public/status` devolve `salesEnabled: false`; webhooks, `GET /orders/:id`, a limpeza e a liberação de pedidos já pagos seguem normais.

## Produção: detalhes da api

- Fora do Docker: `pnpm --filter @moldura/api start` (usa `tsx`, que é dependência da api; lê `api/.env` só se existir, então em produção injete as variáveis no ambiente). O caminho das molduras e das migrações é resolvido a partir do código, não do diretório de onde o processo foi iniciado.
- Antes da primeira subida e a cada deploy com migração: `pnpm --filter @moldura/api db:setup` (cria o banco se faltar e aplica `api/drizzle`).
- Variáveis obrigatórias: `DATABASE_URL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `CORE_API_KEY`, `CORE_WEBHOOK_SECRET`, `SALES_ENABLED` explícito. Opcionais: `PORT`, `WEB_ORIGIN`, `TRUST_PROXY`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_BUCKET`, `CORE_API_URL`, `LOG_LEVEL` (`info` por padrão; `warn` em produção reduz o volume).
- Imagem Docker: o `CMD` roda `tsx src/scripts/setup-db.ts` e `tsx src/main.ts` direto (sem corepack em tempo de execução). O MinIO do `docker-compose.yml` é fixado por digest (`minio/minio@sha256:…`, release `RELEASE.2025-09-07T16-13-09Z`), pois a tag não está mais disponível no Docker Hub.
- Gerar segredos: `openssl rand -hex 24` (senhas do Postgres e do MinIO).

## Checklist de produção

- Troque as credenciais de desenvolvimento do `docker-compose.yml` (Postgres e MinIO `moldura`/`moldura-secret`); o compose é só de desenvolvimento e fixa o MinIO por digest (release `RELEASE.2025-09-07T16-13-09Z`, a versão testada).
- TLS na api, no web e no MinIO: `MINIO_USE_SSL=true`. `MINIO_ENDPOINT` (e a porta) precisa ser o host público que o navegador alcança, porque os links de download assinados são assinados para esse host. HSTS e TLS ficam no proxy.
- Usuário dedicado do MinIO, limitado ao bucket (não use o root).
- Postgres e MinIO escutando só em localhost/rede privada. No Postgres: `log_statement=none`, sem log de parâmetros de consulta, e backups/snapshots com rotação de no máximo 7 dias (senão os pedidos apagados continuam existindo neles).
- Logs do proxy/CDN/MinIO: descarte as query strings e mascare segmentos UUID no caminho (`GET /orders/<uuid>` na api, `/pedido/<uuid>` no web, `results/<uuid>.png` no MinIO); mantenha o log de auditoria/acesso do MinIO desligado.
- `TRUST_PROXY` com o número real de proxies, verificado atrás do proxy de verdade (confira que o IP usado no limite de requisições é o do cliente, não o do proxy), e a api alcançável só pelo proxy.
- Aviso do Core: para trocar o segredo, `webhooks.rotateSecret` (vale na hora) e atualize `CORE_WEBHOOK_SECRET` em seguida; no intervalo os avisos dão 400 e o Core repete, sem perder nada (o polling também libera).
- Logs de acesso do proxy/CDN/host normalmente registram o IP do cliente: desligue-os ou guarde por um período curto e definido (sugestão: até 7 dias). Defina também a retenção dos logs da aplicação (têm `orderRef`, e `pixId` só nos eventos de pago sem imagem e de teto sem confirmação): sugestão de até 30 dias.
- Mantenha o `api/.env` fora de pastas sincronizadas (OneDrive etc.) em produção.
- Vigiar o aviso da regra de ciclo de vida do MinIO e as mensagens "Pedido pago sem imagem" e "Pedido não pago apagado pelo teto sem confirmação" (roteiro acima).
- O web já envia `Referrer-Policy` e `Content-Security-Policy`; defina `NEXT_PUBLIC_IMAGES_ORIGIN` igual à origem dos links assinados do MinIO antes do build.

## Verificação ponta a ponta

O adaptador do gateway é testado com o cliente real do SDK sobre um `fetch` falso (rotas, cabeçalho, corpo e mapeamento de status) e o aviso com assinaturas Standard Webhooks geradas no teste. Em produção, o piloto real (Pix de R$ 2,99 pago, aviso `charge.paid` recebido e pedido liberado) foi feito em 16/10/2026.

## Encerramento (novembro de 2026)

Apps de api e web parados no Coolify, bucket do R2 vazio (o ciclo de vida já tinha apagado fotos e imagens), repositório aberto como portfólio.
