# Moldura Eleitoral

Monorepo pnpm: `common` (schemas e candidatos), `api` (Fastify + Postgres + MinIO + sharp), `web` (Next.js).
O cliente vê a prévia grátis (com marca d'água), paga R$ 3,99 por Pix (AbacatePay) e baixa o PNG sem marca d'água, montado no servidor depois do pagamento.

## Rodar local

1. `docker compose up -d` (Docker Desktop aberto): Postgres :5440 e MinIO :9300 (console :9301), ambos só em 127.0.0.1.
2. `pnpm install`
3. `api/.env`: copie de `api/.env.example` e preencha `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET` (16+ caracteres aleatórios; use 24+). `web/.env.local`: copie de `web/.env.example` (`NEXT_PUBLIC_API_URL`).
   Os arquivos `.env*` ficam fora do git (só `.env.example` e `.env.test` são versionados). Nunca commite segredos. Esta pasta está no OneDrive: mantenha o `api/.env` fora de pastas sincronizadas ou exclua-o da sincronização.
4. `pnpm --filter @moldura/api db:setup`
5. `pnpm dev:api` (http://localhost:6600) e `pnpm dev:web` (http://localhost:6610). O `dev:web` copia as molduras para `web/public/frames` antes de subir.

`web/AGENTS.md` (gerado pelo Next) avisa que esta versão do Next tem mudanças incompatíveis; consulte `web/node_modules/next/dist/docs/` antes de mexer no web.

## Testes

`pnpm test` (precisa do Postgres do passo 1; cria o banco `moldura_test` sozinho) e `pnpm typecheck`. Os testes da api usam armazenamento em memória; o MinIO real só entra no uso local/E2E.

## Molduras

Ficam em `api/assets/frames/<id>.png` (1080×1080, anel opaco, centro e cantos transparentes, sem rostos). `pnpm frames:build` (alias de `frames:placeholder` na api) regenera as 12 molduras provisórias com as cores do partido, o nome em arco e o número, tudo como caminhos de glifos (sem `<text>`, sem depender de fontes do sistema); as molduras finais são geradas pelo Codex e validadas por `pnpm --filter @moldura/api test`.
Os arquivos públicos `/frames/<id>.png` (servidos pelo web) são as molduras **sem** marca d'água, de propósito: são só o anel decorativo, sem a foto do cliente. A marca d'água existe apenas na prévia do navegador.

## Dados dos candidatos e partidos

- Partidos: `common/src/parties.ts` (sigla, nome, número e três cores; sem logotipos). Os hex vêm de pesquisa em sites oficiais e Wikipédia em 03/10/2026; `colorsEstimated: true` marca cores que não vieram de manual de identidade (todas, exceto Solidariedade). PV e PCB não tiveram hex verificado e usam valores razoáveis. PMB agora é "Democrata" (35), PMN é "Mobiliza" (33); União Brasil (44) e PP (11) formam federação, mas mantêm número próprio.
- Candidatos: `common/src/candidates.ts` com os 12 presidentes de 2026. **A lista veio de reportagens** (o site do TSE bloqueou a consulta automatizada): **conferir no DivulgaCand antes de publicar**. Leonardo Avalanche (PRTB) desistiu e não consta. As cores de cada candidato são derivadas do partido.
- O site oferece **só molduras de presidente** (decisão do produto); governadores não são oferecidos. O modelo de dados continua pronto caso isso mude: `office` em `candidates.ts`, `common/src/states.ts` (27 UFs) e `candidatesBy(office, state)`.
- Só dados públicos (nomes, números, partidos, cores): nada de e-mail, telefone, CPF ou endereço.

## Página inicial e ilustrações de IA

- A home (`web/src/app/page.tsx` + `web/src/components/home/`) é toda animada só com CSS (`@keyframes` de `transform`/`opacity`) e um `Reveal` com `IntersectionObserver`; sem biblioteca de animação, sem fontes, imagens ou scripts externos (o CSP não mudou). Com `prefers-reduced-motion: reduce` tudo fica parado no estado final e o avatar do topo não troca.
- Ilustrações: `web/public/art/<id>.webp` (640×640), **estilizadas e geradas por IA** — não são fotos nem material oficial. Só entram as aprovadas; ao aprovar uma nova, copie o arquivo e acrescente o id em `ART_IDS` (`web/src/lib/art.ts`). Sem ilustração, o cartão mostra uma silhueta genérica com a moldura por cima.
- Toda ilustração mostra o selo `AiBadge` ("IA", `aria-label` "Ilustração gerada por IA") no canto superior direito, e o aviso "Ilustrações geradas por IA, estilizadas — não são fotos nem material oficial das campanhas." aparece perto do topo da home e no rodapé. O selo é só para a arte do site: nunca vai sobre a foto do usuário.
- Topo neutro: o hero sempre abre na moldura de exemplo `neutral` (grafite e cinzas, longe das cores de todos os partidos — testado —, "SUA FOTO AQUI", sem número; gerada pelo `frames:build`, mas não é candidato nem aceita em pedidos) e depois passa por todos os candidatos em ordem embaralhada a cada visita (`web/src/lib/hero-slides.ts`), 3,5 s cada. Com movimento reduzido fica no neutro. Os cartões e o `<select>` do `/criar` seguem a ordem alfabética (`sortCandidatesAlphabetically`). Sem `?c=` válido, o `/criar` não escolhe ninguém: mostra "Escolha uma moldura…", a moldura neutra com a silhueta e o botão de pagar fica desabilitado até escolher.
- "Exemplos de molduras" mostra os 12 presidentes em ordem alfabética; em `/criar` o seletor de moldura é uma lista simples dos presidentes, também em ordem alfabética.
- Faixa de partidos: sigla, número e cor (sem logotipos); quando a cor do partido não dá contraste AA com o texto, ela é escurecida só o necessário (`swatch` em `web/src/lib/art.ts`).
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

- `/privacidade` e `/termos` (links no rodapé) descrevem o que o site realmente faz: foto enviada só ao clicar em "Baixar foto pronta", prazos de exclusão, Pix pela AbacatePay sem pedir nome/CPF, IP não guardado (só em memória para limitar abusos), lista "Minhas molduras" no localStorage, sem cookies, análise, anúncios ou rastreadores. **Os textos são um rascunho inicial e precisam ser revisados pelo advogado do operador antes do lançamento.** Se a api mudar prazos ou dados guardados, atualize as duas páginas.
- Variáveis do web (lidas no build; veja `web/.env.example`): `NEXT_PUBLIC_OPERATOR_NAME` (nome de quem opera o site) e `NEXT_PUBLIC_CONTACT_EMAIL` (e-mail para pedidos de LGPD e problemas com pagamento). Sem as duas, as páginas omitem o bloco de contato e o build mostra um aviso.
- Cabeçalhos do web: CSP, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, sem `X-Powered-By`; `Strict-Transport-Security` só em produção.
- `pnpm test` também roda os testes dos helpers do web (`web/src/lib/*.check.ts`, via `tsx --test`).

### Fonte das molduras

O texto das molduras usa a Montserrat ExtraBold (subconjunto latin, `api/assets/fonts/montserrat-latin-800-normal.woff`, extraída do pacote npm `@fontsource/montserrat`, que não é dependência do projeto), licenciada sob a SIL Open Font License 1.1; o texto da licença está em `api/assets/fonts/Montserrat-OFL.txt`. O `opentype.js` (devDependency da api) converte os glifos em caminhos SVG.

## AbacatePay

Conferido em docs.abacatepay.com (API v2, `https://api.abacatepay.com/v2`):

- Webhook: configure no painel a URL `https://<api>/webhooks/abacatepay?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>`. O evento de Pix pago é `transparent.completed` (também existem `transparent.refunded`, `transparent.disputed`, `transparent.lost`).
- A `api` **reconsulta** o status do Pix antes de liberar qualquer pedido; o webhook sozinho não libera nada. Sem webhook, o polling da tela do pedido (consulta a cada poucos segundos) também libera.
- A API documenta 9 status: PENDING, PAID, EXPIRED, CANCELLED, REFUNDED, FAILED, UNDER_DISPUTE, APPROVED, REDEEMED. O cliente mapeia PENDING, PAID, EXPIRED, CANCELLED e REFUNDED para eles mesmos, FAILED para CANCELLED e todo o resto (UNDER_DISPUTE, APPROVED, REDEEMED, valores desconhecidos) para PENDING. Só o literal PAID vira PAID.
- O webhook traz o header `X-Webhook-Signature` (HMAC-SHA256 do corpo bruto com a chave pública da AbacatePay). Não dependemos dele: confiamos no segredo na query e reconsultamos o status do Pix.
- `brCodeBase64` pode vir com o prefixo `data:image/png;base64,`.
- Os campos dentro de `data` do webhook `transparent.completed` não foram confirmados (a api procura qualquer `id`/`externalId` no corpo).
- Dev/sandbox é definido pela chave de API usada. `ABACATEPAY_BASE_URL` permite apontar para outro servidor.

## API

- Multipart de `POST /orders`: os campos `candidateId` e `framing` precisam vir ANTES do arquivo `photo`.
- Limites: `POST /orders` 10 por minuto por IP; `GET /orders/:id` 300 por minuto por IP; a api só reconsulta a AbacatePay no máximo a cada 5 s por pedido (o webhook sempre força), e refaz a montagem de um `paid_failed` no máximo a cada 30 s.
- Só JPEG, PNG e WebP são aceitos, conferidos pelos bytes iniciais antes de a foto chegar ao sharp. Toda resposta leva `X-Content-Type-Options: nosniff`.
- O id do pedido é a credencial do download: quem tem o id consegue ver o status e baixar a imagem paga.
- `TRUST_PROXY` é o número de proxies confiáveis na frente da api (0 = nenhum, o padrão; 1 = um proxy, e assim por diante). A api só deve ser alcançável pelo proxy, numa rede privada: o par direto precisa ter endereço privado/loopback (127/8, 10/8, 172.16/12, 192.168/16, ::1, fc00::/7, fe80::/10), senão o `X-Forwarded-For` é ignorado. Com N saltos a api usa o endereço N posições a partir da direita do cabeçalho. Os valores antigos `false`/`true` valem 0/1.

## Retenção de dados

IP não é gravado; usado só em memória para limitar requisições (o banco não tem coluna de IP). Depois de um deploy, `db:setup` aplica a migração que removeu `orders.ip_address`.

A limpeza roda uma vez na subida da api e depois a cada hora (`cleanupOrders`, sem execuções sobrepostas):

- Pedidos `pending`/`expired`: após 24 h da criação. Antes de apagar, a limpeza reconsulta o Pix na AbacatePay (se pagou, o pedido segue as regras de pago; se a consulta falhar, o pedido é pulado e tentado na hora seguinte). A linha é apagada com condição de status (nunca apaga um pedido que acabou de pagar) e a foto depois; se a foto não puder ser removida, sai um aviso de foto órfã e a regra do MinIO (4 dias) é a rede de segurança.
- Teto independente da AbacatePay: pedido `pending`/`expired` com mais de 3 dias é apagado mesmo que a consulta continue falhando (chave trocada, URL errada, 401/403/404).
- Se esse apagamento por teto acontecer com a consulta falhando, o log traz o aviso "Pedido não pago apagado pelo teto sem confirmação" com `pixId` e `orderRef`: o cliente pode ter pago sem a api saber.
- Pedidos `paid`: após 7 dias do pagamento (ou da criação, se não houver data de pagamento). Imagem final e foto que tenha sobrado são removidas primeiro; a linha inteira (Pix, enquadramento) só é apagada se todas as remoções deram certo, senão tenta de novo na hora seguinte. Qualquer `photoKey` que sobrou de uma remoção que falhou é apagada na hora.
- Pedidos `paid_failed` (cliente pagou e não recebeu a imagem): após 3 dias da criação (com a AbacatePay respondendo); teto de 5 dias mesmo com a AbacatePay fora do ar. O apagamento registra o aviso "Pedido pago sem imagem apagado" com o `pixId` (ver o roteiro abaixo).
- `webhook_events`: após 30 dias.

A regra de ciclo de vida do MinIO (`photos/` 4 dias, `results/` 8 dias) é só uma rede de segurança; a expiração é avaliada por dia (arredondada para a meia-noite UTC e aplicada por um varredor em segundo plano), então 4 e 8 dias são limites superiores com até ~1 dia de folga (a limpeza normalmente apaga a foto em 24 h ou no pagamento). Se ela não puder ser aplicada, a api apenas registra o aviso "Não consegui configurar a expiração automática do bucket" na subida: em produção, o operador precisa vigiar esse aviso. Como a foto some do MinIO em 4 dias, um `paid_failed` não pode mais ser remontado depois disso: aja antes.

### Roteiro do operador: pedido pago sem imagem

0. Mesmo roteiro para "Pedido não pago apagado pelo teto sem confirmação": confira o `pixId` no painel da AbacatePay; se estiver pago, reembolse.
1. Procure no log da api a mensagem "Pedido pago sem imagem" (quando a montagem falha) ou "Pedido pago sem imagem apagado" (quando a limpeza remove o pedido). Os dois eventos trazem `orderRef` (hash curto, serve só para achar o pedido nos logs) e `pixId` (o id da cobrança). São (com o aviso de teto sem confirmação) os únicos logs que contêm o `pixId`.
2. No painel da AbacatePay, localize a cobrança por esse `pixId` e faça o reembolso.
3. O pedido não precisa de mais nada: a limpeza apaga a linha sozinha (3 a 5 dias).

## Minhas molduras

Depois do pagamento, o navegador guarda em `localStorage` (chave `moldura:orders:v1`) só o id do pedido, o candidato e a data, por 7 dias (máximo 20). Nunca a foto, o Pix ou o link de download. A página `/minhas` busca de novo cada imagem na api, que gera um link assinado novo a cada abertura. Há botões para apagar um item ou tudo.

- Risco: o id do pedido funciona como credencial do download. Quem tiver acesso ao navegador vê as molduras; em computador compartilhado, apague ao terminar. Apagar a lista não basta: o histórico do navegador guarda o endereço `/pedido/<id>`, e quem abrir esse endereço vê a imagem por 7 dias (e a página guarda o pedido de novo). Por isso, em computador compartilhado, apague também o histórico do navegador ou use uma aba anônima; na tela do pedido há o botão "Não guardar neste aparelho". Entradas inválidas, expiradas ou de pedidos que a api não conhece mais são removidas sozinhas.
- O site envia `Content-Security-Policy` (ver `web/next.config.ts`): scripts e estilos só do próprio site (`'unsafe-inline'` é exigido pelo Next sem nonces), imagens do próprio site e da origem do MinIO, conexões só para a api.
- Em produção defina `NEXT_PUBLIC_IMAGES_ORIGIN` (origem pública do MinIO, ex.: `https://files.exemplo.com.br`) e `NEXT_PUBLIC_API_URL` **antes do build**: os dois entram no CSP e no código do navegador. `NEXT_PUBLIC_IMAGES_ORIGIN` precisa ser igual, caractere por caractere, à origem dos links assinados (`localhost` é diferente de `127.0.0.1`); se for diferente, o CSP bloqueia a imagem e a página `/minhas` descarta o link. O valor é fixado no build, e o build avisa se ele estiver vazio ou inválido.

## Produção: como subir a api

- Comando: `pnpm --filter @moldura/api start` (usa `tsx`, que é dependência da api; lê `api/.env` só se existir, então em produção injete as variáveis no ambiente). O caminho das molduras e das migrações é resolvido a partir do código, não do diretório de onde o processo foi iniciado.
- Antes da primeira subida e a cada deploy com migração: `pnpm --filter @moldura/api db:setup` (cria o banco se faltar e aplica `api/drizzle`).
- Variáveis obrigatórias: `DATABASE_URL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET` (16+ caracteres). Opcionais: `PORT`, `WEB_ORIGIN`, `TRUST_PROXY`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_BUCKET`, `ABACATEPAY_BASE_URL`, `LOG_LEVEL` (`info` por padrão; `warn` em produção reduz o volume).
- Gerar segredos: `openssl rand -hex 24` (senhas do Postgres e do MinIO, segredo do webhook).

## Checklist de produção

- Troque as credenciais de desenvolvimento do `docker-compose.yml` (Postgres e MinIO `moldura`/`moldura-secret`); o compose é só de desenvolvimento e fixa o MinIO em `RELEASE.2025-09-07T16-13-09Z` (a versão testada).
- TLS na api, no web e no MinIO: `MINIO_USE_SSL=true`. `MINIO_ENDPOINT` (e a porta) precisa ser o host público que o navegador alcança, porque os links de download assinados são assinados para esse host. HSTS e TLS ficam no proxy.
- Usuário dedicado do MinIO, limitado ao bucket (não use o root).
- Postgres e MinIO escutando só em localhost/rede privada. No Postgres: `log_statement=none`, sem log de parâmetros de consulta, e backups/snapshots com rotação de no máximo 7 dias (senão os pedidos apagados continuam existindo neles).
- Logs do proxy/CDN/MinIO: descarte as query strings (o segredo do webhook viaja em `?webhookSecret=`) e mascare segmentos UUID no caminho (`GET /orders/<uuid>` na api, `/pedido/<uuid>` no web, `results/<uuid>.png` no MinIO); mantenha o log de auditoria/acesso do MinIO desligado.
- `TRUST_PROXY` com o número real de proxies, verificado atrás do proxy de verdade (confira que o IP usado no limite de requisições é o do cliente, não o do proxy), e a api alcançável só pelo proxy.
- Rotação do segredo do webhook: atualize `ABACATEPAY_WEBHOOK_SECRET` na api e a URL do webhook no painel da AbacatePay juntos; entre um passo e outro haverá respostas 401 (a AbacatePay reenvia).
- Logs de acesso do proxy/CDN/host normalmente registram o IP do cliente: desligue-os ou guarde por um período curto e definido (sugestão: até 7 dias). Defina também a retenção dos logs da aplicação (têm `orderRef`, e `pixId` só nos eventos de pago sem imagem e de teto sem confirmação): sugestão de até 30 dias.
- Mantenha o `api/.env` fora de pastas sincronizadas (OneDrive etc.) em produção.
- Vigiar o aviso da regra de ciclo de vida do MinIO e as mensagens "Pedido pago sem imagem" e "Pedido não pago apagado pelo teto sem confirmação" (roteiro acima).
- O web já envia `Referrer-Policy` e `Content-Security-Policy`; defina `NEXT_PUBLIC_IMAGES_ORIGIN` igual à origem dos links assinados do MinIO antes do build.

## Verificação ponta a ponta (sem a AbacatePay real)

Sem chave real, o fluxo foi verificado com um servidor falso da AbacatePay (`/v2/transparents/create` e `/check`) via `ABACATEPAY_BASE_URL`, com Postgres e MinIO reais: pedido 201 sem campos internos, foto em `photos/`, após o Pix pago o pedido vira `paid`, o PNG baixado tem 1080×1080, foto no círculo, moldura por cima e sem marca d'água, `results/<id>.png` existe e `photos/<id>.jpg` some; webhook 200, repetido vira `duplicate`, segredo errado dá 401; os logs não trazem segredo, id do pedido nem chaves de armazenamento; a limpeza apaga linha e arquivo. Falta repetir com uma chave de desenvolvimento da AbacatePay para confirmar o formato real das respostas e dos webhooks.

## Pendências

- Hospedagem e domínio.
- Testar com a AbacatePay real (chave de desenvolvimento): formato de `data` do webhook e simulação de pagamento.
- Validar com advogado eleitoral a cobrança por material de apoio e o uso dos nomes dos candidatos antes de lançar.
