# Moldura Eleitoral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site em que a pessoa envia a foto, escolhe a moldura de um candidato, paga R$ 3,99 por Pix (AbacatePay) e baixa o PNG final sem marca d'água, montado no servidor só depois do pagamento.

**Architecture:** Monorepo pnpm com `common` (schemas Zod, candidatos e a matemática de enquadramento, consumido como código-fonte), `api` (Fastify + Drizzle + Postgres + MinIO + sharp) e `web` (Next.js). A `web` mostra a prévia com marca d'água em canvas; `POST /orders` guarda a foto no MinIO e cria o Pix; o webhook e o polling de `GET /orders/:id` reconsultam a AbacatePay e, se `PAID`, montam o PNG com `sharp`.

**Tech Stack:** Node 22, pnpm, TypeScript, Fastify 5, Zod 4, Drizzle ORM + postgres-js, MinIO client, sharp, Next.js (App Router), `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-03-moldura-eleitoral-design.md`

**Desvio da spec (decidido neste plano):** `common` é consumido como **código-fonte** (`exports` apontando para `./src/index.ts`, `transpilePackages` no Next), sem etapa de build para `dist`. É uma simplificação de implementação; o resto da spec não muda.

## Global Constraints

- Preço: **399 centavos** (R$ 3,99); Pix com `expiresIn` de **1800 s**; link de download assinado de **300 s**.
- Foto: só `image/jpeg`, `image/png`, `image/webp`; máximo **8 MB** (`8 * 1024 * 1024`); normalizada no servidor para JPEG com lado máximo de 2000 px.
- Saída final: **PNG 1080×1080**. Moldura: PNG 1080×1080, anel de `FRAME_RING_RATIO = 0.13` da largura, centro transparente de raio `540 - 140.4`, **sem rostos, sem fotos de pessoas, sem logos/símbolos de partido**.
- Estados do pedido: `pending`, `paid`, `paid_failed`, `expired`. Sem estorno.
- Sem login e sem CPF. Nenhum dado pessoal além da foto e do IP.
- Foto original é apagada assim que o pedido vira `paid`; pedidos não pagos são apagados após **24 h**; imagem pronta é apagada após **7 dias**.
- Convenções do CRM: identificadores em inglês, textos de tela/erro em português; imports internos por `@/` em `api` e `web`; **`common` usa imports relativos**; import em uma linha; sem `.js` em import interno; `async/await` (sem `.then`); `if/else` sempre com `{}` (só a guarda de uma linha sem `else` fica sem chave); queries Drizzle com uma chamada por linha; respostas HTTP pelos helpers de `@/core/http-fastify`.
- Segredos só em `.env` (nunca no repositório); a chave da AbacatePay só existe na `api`.
- Portas locais (evitam o CRM): Postgres **5433**, MinIO **9200/9201**, api **6600**, web **6610**.
- Commits terminam com as linhas de atribuição que o ambiente exige.

## Review Focus

Entradas e falhas que a spec implica mas que nenhum fluxo feliz exercita; cada uma tem teste na tarefa dona:

1. Arquivo que não é imagem, mas vem com `Content-Type: image/jpeg` → 400 com mensagem em português (nunca 500). Task 7.
2. Foto acima de 8 MB → 413 (e nada fica gravado no MinIO). Task 7.
3. Webhook de "pago" forjado (segredo certo, mas a AbacatePay diz `PENDING`) → o pedido **não** é liberado. Task 8.
4. O segredo do webhook (que viaja na query string) **não aparece nos logs**. Task 8.
5. `GET /orders/<não-uuid>` → 404 (não 500 do Postgres); AbacatePay fora do ar no `POST` → 502 sem foto órfã; fora do ar no `GET` → devolve o estado local. Task 7.
6. Enquadramento extremo (zoom 1, deslocamento ±1: a foto não cobre o círculo) → monta sem erro. Task 5.

---

### Task 1: Esqueleto do monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `docker-compose.yml`, `README.md`

**Interfaces:**
- Produces: workspace com pacotes `common`, `api`, `web` (criados nas próximas tarefas); Postgres em `localhost:5433` (user/senha/db `moldura`), MinIO em `localhost:9200` (console 9201, `moldura` / `moldura-secret`).

- [ ] **Step 1: Inicializar git e arquivos da raiz**

```bash
git init
```

`package.json`:

```json
{
  "name": "moldura-eleitoral",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "dev:api": "pnpm --filter @moldura/api dev",
    "dev:web": "pnpm --filter @moldura/web dev",
    "test": "pnpm -r --workspace-concurrency=1 test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - common
  - api
  - web

onlyBuiltDependencies:
  - sharp
  - esbuild
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

`.gitignore`:

```
node_modules
.env
.next
dist
*.tsbuildinfo
web/public/frames
```

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: moldura
      POSTGRES_PASSWORD: moldura
      POSTGRES_DB: moldura
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: moldura
      MINIO_ROOT_PASSWORD: moldura-secret
    ports:
      - "9200:9000"
      - "9201:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

`README.md` (será completado na Task 12):

```markdown
# Moldura Eleitoral

Monorepo: `common` (schemas), `api` (Fastify), `web` (Next.js).

Rodar infra local: `docker compose up -d` (precisa do Docker Desktop aberto).
```

- [ ] **Step 2: Subir a infra e conferir**

Run: `docker compose up -d` e depois `docker compose ps`
Expected: `postgres` e `minio` com status `running`. (Se o Docker Desktop estiver fechado, abra-o antes.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: esqueleto do monorepo e infra local"
```

---

### Task 2: Pacote `common` (candidatos, enquadramento, schemas)

**Files:**
- Create: `common/package.json`, `common/tsconfig.json`, `common/src/index.ts`, `common/src/candidates.ts`, `common/src/framing.ts`, `common/src/orders.ts`, `common/src/common.check.ts`

**Interfaces:**
- Produces (todos exportados de `@moldura/common`):
  - `type Candidate = { id: string; name: string; number: string; colors: [string, string, string] }`; `CANDIDATES: readonly Candidate[]`; `findCandidate(id: string): Candidate | undefined`
  - `FRAME_SIZE = 1080`; `FRAME_RING_RATIO = 0.13`; `MAX_ZOOM = 3`; `innerRadius(size?: number): number`; `placePhoto(input: { imageWidth: number; imageHeight: number; zoom: number; offsetX: number; offsetY: number; size?: number }): { left: number; top: number; width: number; height: number }`
  - `PRICE_CENTS`, `PIX_EXPIRES_SECONDS`, `DOWNLOAD_URL_SECONDS`, `PHOTO_MAX_BYTES`, `PHOTO_MIME_TYPES`, `ORDER_STATUSES`
  - `FramingSchema`, `type Framing`, `CreateOrderSchema`, `type CreateOrderBody`, `OrderStatusSchema`, `type OrderStatus`, `OrderSchema`, `type Order` (`{ id; status; candidateId; pix: { brCode; brCodeBase64; expiresAt } | null; downloadUrl: string | null }`)

- [ ] **Step 1: Criar o pacote e instalar dependências**

`common/package.json`:

```json
{
  "name": "@moldura/common",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "tsx --test \"src/**/*.check.ts\""
  }
}
```

`common/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

```bash
pnpm --filter @moldura/common add zod
pnpm --filter @moldura/common add -D typescript tsx @types/node
```

- [ ] **Step 2: Escrever o teste que falha**

`common/src/common.check.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATES, CreateOrderSchema, FRAME_SIZE, findCandidate, innerRadius, placePhoto } from "./index";

test("innerRadius deixa 13% de anel de cada lado", () => {
  assert.equal(innerRadius(FRAME_SIZE), 540 - 140.4);
});

test("placePhoto cobre o círculo com foto quadrada", () => {
  const placement = placePhoto({ imageWidth: 1000, imageHeight: 1000, zoom: 1, offsetX: 0, offsetY: 0 });

  assert.ok(Math.abs(placement.width - 799.2) < 0.001);
  assert.ok(Math.abs(placement.left - 140.4) < 0.001);
});

test("placePhoto usa o menor lado para cobrir quando a foto é larga", () => {
  const placement = placePhoto({ imageWidth: 2000, imageHeight: 1000, zoom: 1, offsetX: 0, offsetY: 0 });

  assert.ok(Math.abs(placement.height - 799.2) < 0.001);
  assert.ok(Math.abs(placement.width - 1598.4) < 0.001);
});

test("placePhoto aplica zoom e deslocamento como fração do quadro", () => {
  const placement = placePhoto({ imageWidth: 1000, imageHeight: 1000, zoom: 2, offsetX: 0.1, offsetY: -0.1 });

  assert.ok(Math.abs(placement.width - 1598.4) < 0.001);
  assert.ok(Math.abs(placement.left - (540 - 799.2 + 108)) < 0.001);
  assert.ok(Math.abs(placement.top - (540 - 799.2 - 108)) < 0.001);
});

test("findCandidate acha por id e devolve undefined para desconhecido", () => {
  assert.equal(findCandidate("lula")?.number, "13");
  assert.equal(findCandidate("ninguem"), undefined);
  assert.equal(CANDIDATES.length, 6);
});

test("CreateOrderSchema aceita pedido válido", () => {
  const result = CreateOrderSchema.safeParse({ candidateId: "lula", framing: { zoom: 1.5, offsetX: 0, offsetY: 0 } });

  assert.equal(result.success, true);
});

test("CreateOrderSchema rejeita candidato desconhecido, zoom e deslocamento fora da faixa", () => {
  const valid = { zoom: 1, offsetX: 0, offsetY: 0 };

  assert.equal(CreateOrderSchema.safeParse({ candidateId: "x", framing: valid }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, zoom: 0.5 } }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, zoom: 4 } }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, offsetX: 2 } }).success, false);
  assert.equal(CreateOrderSchema.safeParse({ candidateId: "lula", framing: { ...valid, offsetY: Number.NaN } }).success, false);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @moldura/common test`
Expected: FAIL (`Cannot find module './index'`).

- [ ] **Step 4: Implementar**

`common/src/candidates.ts`:

```ts
export type Candidate = {
  id: string;
  name: string;
  number: string;
  colors: [string, string, string];
};

export const CANDIDATES: readonly Candidate[] = [
  { id: "lula", name: "LULA", number: "13", colors: ["#d81f26", "#ffffff", "#f5c400"] },
  { id: "flavio-bolsonaro", name: "FLÁVIO BOLSONARO", number: "22", colors: ["#0b3d91", "#f5c400", "#1a8f3c"] },
  { id: "ronaldo-caiado", name: "RONALDO CAIADO", number: "55", colors: ["#0f7a3a", "#f5c400", "#0b3d91"] },
  { id: "zema", name: "ZEMA", number: "30", colors: ["#f26a1b", "#f5c400", "#ffffff"] },
  { id: "samara", name: "SAMARA", number: "80", colors: ["#7b2cbf", "#e83e8c", "#ffffff"] },
  { id: "augusto-cury", name: "AUGUSTO CURY", number: "70", colors: ["#1d3f9e", "#f5c400", "#0f172a"] },
];

export function findCandidate(id: string): Candidate | undefined {
  return CANDIDATES.find((candidate) => candidate.id === id);
}
```

`common/src/framing.ts`:

```ts
export const FRAME_SIZE = 1080;
export const FRAME_RING_RATIO = 0.13;
export const MAX_ZOOM = 3;

export type PlacePhotoInput = {
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  size?: number;
};

export type PhotoPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function innerRadius(size: number = FRAME_SIZE): number {
  return size / 2 - size * FRAME_RING_RATIO;
}

export function placePhoto(input: PlacePhotoInput): PhotoPlacement {
  const size = input.size ?? FRAME_SIZE;
  const diameter = innerRadius(size) * 2;
  const scale = Math.max(diameter / input.imageWidth, diameter / input.imageHeight) * input.zoom;
  const width = input.imageWidth * scale;
  const height = input.imageHeight * scale;

  return {
    left: size / 2 - width / 2 + input.offsetX * size,
    top: size / 2 - height / 2 + input.offsetY * size,
    width,
    height,
  };
}
```

`common/src/orders.ts`:

```ts
import { z } from "zod";
import { findCandidate } from "./candidates";
import { MAX_ZOOM } from "./framing";

export const PRICE_CENTS = 399;
export const PIX_EXPIRES_SECONDS = 1800;
export const DOWNLOAD_URL_SECONDS = 300;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_MIME_TYPES: string[] = ["image/jpeg", "image/png", "image/webp"];
export const ORDER_STATUSES = ["pending", "paid", "paid_failed", "expired"] as const;

export const FramingSchema = z.object({
  zoom: z.number().min(1).max(MAX_ZOOM),
  offsetX: z.number().min(-1).max(1),
  offsetY: z.number().min(-1).max(1),
});
export type Framing = z.infer<typeof FramingSchema>;

export const CreateOrderSchema = z.object({
  candidateId: z.string().refine((id) => findCandidate(id) !== undefined, "Candidato inválido"),
  framing: FramingSchema,
});
export type CreateOrderBody = z.infer<typeof CreateOrderSchema>;

export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  status: OrderStatusSchema,
  candidateId: z.string(),
  pix: z
    .object({
      brCode: z.string(),
      brCodeBase64: z.string(),
      expiresAt: z.string(),
    })
    .nullable(),
  downloadUrl: z.string().nullable(),
});
export type Order = z.infer<typeof OrderSchema>;
```

`common/src/index.ts`:

```ts
export * from "./candidates";
export * from "./framing";
export * from "./orders";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @moldura/common test` e `pnpm --filter @moldura/common typecheck`
Expected: todos os testes PASS; typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(common): candidatos, enquadramento e schemas de pedido"
```

---

### Task 3: Fundação da `api` (env, logger, banco, storage, helpers HTTP)

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/drizzle.config.ts`, `api/.env.example`, `api/.env.test`, `api/src/core/env.ts`, `api/src/core/logger.ts`, `api/src/core/db.ts`, `api/src/core/storage.ts`, `api/src/core/http-fastify.ts`, `api/src/modules/orders/schema.ts`, `api/src/modules/payments/schema.ts`, `api/src/scripts/setup-db.ts`, `api/src/scripts/fixtures/memory-storage.ts`, `api/src/scripts/db.check.ts`
- Generated: `api/drizzle/*.sql` (por `drizzle-kit generate`)

**Interfaces:**
- Produces:
  - `env` (objeto validado) de `@/core/env`
  - `createLogger(stream?): Logger`, `logger`, `sanitizeUrl(url: string): string` de `@/core/logger`
  - `createDb(url: string): { db: Database; sql: Sql }`, `type Database` de `@/core/db`
  - `interface Storage { ensureBucket(): Promise<void>; put(key: string, body: Buffer, contentType: string): Promise<void>; get(key: string): Promise<Buffer>; remove(key: string): Promise<void>; signedUrl(key: string, seconds: number): Promise<string> }` e `createMinioStorage(): Storage` de `@/core/storage`
  - `createMemoryStorage(): MemoryStorage` (Storage + `files: Map<string, Buffer>` + `puts: string[]`) de `@/scripts/fixtures/memory-storage`
  - `ok`, `created`, `badReq`, `unauthorized`, `notFound`, `tooLarge`, `badGateway`, `serverErr` de `@/core/http-fastify`, todos `(reply: FastifyReply, ...)`
  - Tabelas `orders` (`type OrderRow = typeof orders.$inferSelect`) e `webhookEvents`

- [ ] **Step 1: Criar o pacote e instalar dependências**

`api/package.json`:

```json
{
  "name": "@moldura/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=.env src/main.ts",
    "start": "tsx --env-file=.env src/main.ts",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:setup": "tsx --env-file=.env src/scripts/setup-db.ts",
    "frames:placeholder": "tsx src/scripts/make-placeholder-frames.ts",
    "test": "tsx --env-file=.env.test src/scripts/setup-db.ts && tsx --env-file=.env.test --test --test-concurrency=1 \"src/**/*.check.ts\""
  }
}
```

`api/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2023"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "drizzle.config.ts"]
}
```

```bash
pnpm --filter @moldura/api add @moldura/common@workspace:* fastify @fastify/cors @fastify/multipart @fastify/rate-limit zod drizzle-orm postgres minio sharp pino
pnpm --filter @moldura/api add -D typescript tsx @types/node drizzle-kit
```

- [ ] **Step 2: Variáveis de ambiente**

`api/.env.example`:

```
PORT=6600
DATABASE_URL=postgres://moldura:moldura@localhost:5433/moldura
WEB_ORIGIN=http://localhost:6610
TRUST_PROXY=false
MINIO_ENDPOINT=localhost
MINIO_PORT=9200
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=moldura
MINIO_SECRET_KEY=moldura-secret
MINIO_BUCKET=moldura
ABACATEPAY_API_KEY=
ABACATEPAY_BASE_URL=https://api.abacatepay.com/v2
ABACATEPAY_WEBHOOK_SECRET=
```

`api/.env.test` (valores descartáveis, só para teste local):

```
PORT=6601
DATABASE_URL=postgres://moldura:moldura@localhost:5433/moldura_test
WEB_ORIGIN=http://localhost:6610
TRUST_PROXY=false
MINIO_ENDPOINT=localhost
MINIO_PORT=9200
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=moldura
MINIO_SECRET_KEY=moldura-secret
MINIO_BUCKET=moldura-test
ABACATEPAY_API_KEY=test-key
ABACATEPAY_BASE_URL=http://localhost:1
ABACATEPAY_WEBHOOK_SECRET=test-webhook-secret-123456
```

Copie `.env.example` para `.env` e preencha `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET` (um valor aleatório de 24+ caracteres, ex.: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).

- [ ] **Step 3: Núcleo (`env`, `logger`, `db`, `http-fastify`, `storage`)**

`api/src/core/env.ts`:

```ts
import { z } from "zod";

const BooleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const EnvSchema = z.object({
  PORT: z.coerce.number().default(6600),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:6610"),
  TRUST_PROXY: BooleanFlag,
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9200),
  MINIO_USE_SSL: BooleanFlag,
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default("moldura"),
  ABACATEPAY_API_KEY: z.string().min(1),
  ABACATEPAY_BASE_URL: z.string().default("https://api.abacatepay.com/v2"),
  ABACATEPAY_WEBHOOK_SECRET: z.string().min(16),
});

export const env = EnvSchema.parse(process.env);
```

`api/src/core/logger.ts`:

```ts
import pino from "pino";
import type { DestinationStream, Logger } from "pino";

export type { Logger };

export function sanitizeUrl(url: string): string {
  const [path] = url.split("?");

  return path ?? url;
}

export function createLogger(stream?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      serializers: {
        req(req) {
          return { method: req.method, url: sanitizeUrl(req.url) };
        },
      },
    },
    stream,
  );
}

export const logger = createLogger();
```

`api/src/core/db.ts`:

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as orderSchema from "@/modules/orders/schema";
import * as paymentSchema from "@/modules/payments/schema";

const schema = { ...orderSchema, ...paymentSchema };

export function createDb(url: string) {
  const sql = postgres(url);
  const db = drizzle(sql, { schema });

  return { db, sql };
}

export type Database = ReturnType<typeof createDb>["db"];
```

`api/src/core/http-fastify.ts`:

```ts
import type { FastifyReply } from "fastify";

export function ok<T>(reply: FastifyReply, data: T) {
  return reply.code(200).send(data);
}

export function created<T>(reply: FastifyReply, data: T) {
  return reply.code(201).send(data);
}

export function badReq(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: message });
}

export function unauthorized(reply: FastifyReply, message: string) {
  return reply.code(401).send({ error: message });
}

export function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: message });
}

export function tooLarge(reply: FastifyReply, message: string) {
  return reply.code(413).send({ error: message });
}

export function badGateway(reply: FastifyReply, message: string) {
  return reply.code(502).send({ error: message });
}

export function serverErr(reply: FastifyReply, message = "Erro interno. Tente de novo em instantes.") {
  return reply.code(500).send({ error: message });
}
```

`api/src/core/storage.ts`:

```ts
import { Client } from "minio";
import { env } from "@/core/env";

export interface Storage {
  ensureBucket(): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, seconds: number): Promise<string>;
}

export function createMinioStorage(): Storage {
  const bucket = env.MINIO_BUCKET;
  const client = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  return {
    async ensureBucket() {
      const exists = await client.bucketExists(bucket);

      if (!exists) {
        await client.makeBucket(bucket);
      }
    },

    async put(key, body, contentType) {
      await client.putObject(bucket, key, body, body.length, { "Content-Type": contentType });
    },

    async get(key) {
      const stream = await client.getObject(bucket, key);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    },

    async remove(key) {
      await client.removeObject(bucket, key);
    },

    async signedUrl(key, seconds) {
      return client.presignedGetObject(bucket, key, seconds, {
        "response-content-disposition": 'attachment; filename="minha-moldura.png"',
      });
    },
  };
}
```

`api/src/scripts/fixtures/memory-storage.ts`:

```ts
import type { Storage } from "@/core/storage";

export type MemoryStorage = Storage & {
  files: Map<string, Buffer>;
  puts: string[];
};

export function createMemoryStorage(): MemoryStorage {
  const files = new Map<string, Buffer>();
  const puts: string[] = [];

  return {
    files,
    puts,

    async ensureBucket() {},

    async put(key, body) {
      files.set(key, body);
      puts.push(key);
    },

    async get(key) {
      const body = files.get(key);

      if (!body) {
        throw new Error(`Objeto não encontrado: ${key}`);
      }

      return body;
    },

    async remove(key) {
      files.delete(key);
    },

    async signedUrl(key) {
      return `memory://${key}`;
    },
  };
}
```

- [ ] **Step 4: Tabelas e migração**

`api/src/modules/orders/schema.ts` (sem imports internos `@/`, porque o `drizzle-kit` lê este arquivo; a lista de status repete `ORDER_STATUSES` de propósito):

```ts
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Framing } from "@moldura/common";

export const orderStatus = pgEnum("order_status", ["pending", "paid", "paid_failed", "expired"]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: orderStatus("status").notNull().default("pending"),
  candidateId: text("candidate_id").notNull(),
  photoKey: text("photo_key"),
  framing: jsonb("framing").$type<Framing>().notNull(),
  pixId: text("pix_id").notNull().unique(),
  pixBrCode: text("pix_br_code").notNull(),
  pixBrCodeBase64: text("pix_br_code_base64").notNull(),
  resultKey: text("result_key"),
  ipAddress: text("ip_address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type OrderRow = typeof orders.$inferSelect;
```

`api/src/modules/payments/schema.ts`:

```ts
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`api/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/modules/orders/schema.ts", "./src/modules/payments/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

```bash
pnpm --filter @moldura/api db:generate
```

Expected: cria `api/drizzle/0000_*.sql` com `CREATE TABLE "orders"` e `"webhook_events"`.

`api/src/scripts/setup-db.ts`:

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const dbName = url.pathname.slice(1);

  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Nome de banco inválido: ${dbName}`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1 });
  const existing = await admin`select 1 from pg_database where datname = ${dbName}`;

  if (existing.length === 0) {
    await admin.unsafe(`create database "${dbName}"`);
  }

  await admin.end();

  const sql = postgres(url.toString(), { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Teste de fumaça do banco (falha antes da migração, passa depois)**

`api/src/scripts/db.check.ts`:

```ts
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@/core/db";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";

const { db, sql } = createDb(process.env.DATABASE_URL ?? "");

after(async () => {
  await sql.end();
});

test("as tabelas existem depois da migração", async () => {
  const orderRows = await db.select().from(orders).limit(1);
  const eventRows = await db.select().from(webhookEvents).limit(1);

  assert.ok(Array.isArray(orderRows));
  assert.ok(Array.isArray(eventRows));
});

test("pix_id é único", async () => {
  await db.delete(orders);

  const values = {
    candidateId: "lula",
    framing: { zoom: 1, offsetX: 0, offsetY: 0 },
    pixId: "pix_dup",
    pixBrCode: "000",
    pixBrCodeBase64: "QUJD",
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 60_000),
  };

  await db.insert(orders).values(values);

  await assert.rejects(db.insert(orders).values(values));

  await db.delete(orders);
});
```

Run: `pnpm --filter @moldura/api test`
Expected: `setup-db` cria `moldura_test`, aplica a migração e os 2 testes PASS (Postgres do Task 1 precisa estar de pé).

- [ ] **Step 6: Typecheck e commit**

Run: `pnpm --filter @moldura/api typecheck`
Expected: sem erros.

```bash
git add -A
git commit -m "feat(api): fundação com env, logger, banco, storage e migração"
```

---

### Task 4: Molduras (placeholder determinístico, validador e geração pelo Codex)

**Files:**
- Create: `api/src/scripts/placeholder-frame.ts`, `api/src/scripts/make-placeholder-frames.ts`, `api/src/scripts/frames.check.ts`, `api/src/scripts/fixtures/pixels.ts`
- Create: `api/assets/frames/<candidate-id>.png` (6 arquivos)

**Interfaces:**
- Consumes: `CANDIDATES`, `FRAME_SIZE`, `FRAME_RING_RATIO`, `innerRadius`.
- Produces:
  - `renderPlaceholderFrame(candidate: Candidate): Promise<Buffer>` (PNG 1080×1080 com centro transparente)
  - `validateFrame(png: Buffer): Promise<string[]>` (lista de problemas; vazia = válida) em `@/scripts/placeholder-frame`
  - `pixelAt(png: Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }>` em `@/scripts/fixtures/pixels`

- [ ] **Step 1: Escrever o teste que falha**

`api/src/scripts/fixtures/pixels.ts`:

```ts
import sharp from "sharp";

export async function pixelAt(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * 4;

  return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}
```

`api/src/scripts/frames.check.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES } from "@moldura/common";
import { renderPlaceholderFrame, validateFrame } from "@/scripts/placeholder-frame";

const FRAMES_DIR = path.resolve("assets/frames");

test("o placeholder passa no validador", async () => {
  const candidate = CANDIDATES[1];
  const png = await renderPlaceholderFrame(candidate);

  assert.deepEqual(await validateFrame(png), []);
});

test("o validador acusa moldura com centro opaco", async () => {
  const sharp = (await import("sharp")).default;
  const solid = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: "#ff0000" } }).png().toBuffer();

  const problems = await validateFrame(solid);

  assert.ok(problems.length > 0);
});

for (const candidate of CANDIDATES) {
  test(`assets/frames/${candidate.id}.png existe e é válida`, async () => {
    const png = await readFile(path.join(FRAMES_DIR, `${candidate.id}.png`));

    assert.deepEqual(await validateFrame(png), []);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @moldura/api test`
Expected: FAIL (`placeholder-frame` não existe).

- [ ] **Step 3: Implementar o placeholder e o validador**

`api/src/scripts/placeholder-frame.ts`:

```ts
import sharp from "sharp";
import { FRAME_RING_RATIO, FRAME_SIZE, innerRadius } from "@moldura/common";
import type { Candidate } from "@moldura/common";
import { pixelAt } from "@/scripts/fixtures/pixels";

function arcPath(center: number, radius: number, startAngle: number, endAngle: number): string {
  const startX = center + radius * Math.cos(startAngle);
  const startY = center + radius * Math.sin(startAngle);
  const endX = center + radius * Math.cos(endAngle);
  const endY = center + radius * Math.sin(endAngle);

  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
}

export async function renderPlaceholderFrame(candidate: Candidate): Promise<Buffer> {
  const size = FRAME_SIZE;
  const center = size / 2;
  const ring = size * FRAME_RING_RATIO;
  const inner = innerRadius(size);
  const middle = inner + ring / 2;
  const badge = size * 0.11;
  const [main, second, third] = candidate.colors;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${center}" cy="${center}" r="${middle}" fill="none" stroke="${main}" stroke-width="${ring}"/>
    <path d="${arcPath(center, center - ring * 0.16, Math.PI * 0.05, Math.PI * 0.55)}" fill="none" stroke="${second}" stroke-width="${ring * 0.32}"/>
    <path d="${arcPath(center, inner + ring * 0.16, Math.PI * 0.05, Math.PI * 0.55)}" fill="none" stroke="${third}" stroke-width="${ring * 0.32}"/>
    <circle cx="${center}" cy="${size - badge * 0.95}" r="${badge}" fill="${main}" stroke="#ffffff" stroke-width="${size * 0.012}"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function validateFrame(png: Buffer): Promise<string[]> {
  const problems: string[] = [];
  const meta = await sharp(png).metadata();

  if (meta.width !== FRAME_SIZE || meta.height !== FRAME_SIZE) {
    problems.push(`tamanho ${meta.width}x${meta.height}, esperado ${FRAME_SIZE}x${FRAME_SIZE}`);

    return problems;
  }

  const center = FRAME_SIZE / 2;
  const centerPixel = await pixelAt(png, center, center);
  const cornerPixel = await pixelAt(png, 2, 2);
  const ringPixel = await pixelAt(png, center, Math.round(center - innerRadius() - 20));

  if (centerPixel.a !== 0) {
    problems.push("o centro não é transparente");
  }

  if (cornerPixel.a !== 0) {
    problems.push("o canto não é transparente");
  }

  if (ringPixel.a < 250) {
    problems.push("o anel não é opaco no topo");
  }

  return problems;
}
```

`api/src/scripts/make-placeholder-frames.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATES } from "@moldura/common";
import { renderPlaceholderFrame } from "@/scripts/placeholder-frame";

async function main() {
  const dir = path.resolve("assets/frames");
  await mkdir(dir, { recursive: true });

  for (const candidate of CANDIDATES) {
    const png = await renderPlaceholderFrame(candidate);
    await writeFile(path.join(dir, `${candidate.id}.png`), png);
    console.log(`ok ${candidate.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Gerar os placeholders e rodar**

Run: `pnpm --filter @moldura/api frames:placeholder` e depois `pnpm --filter @moldura/api test`
Expected: imprime `ok <id>` 6 vezes; todos os testes PASS.

- [ ] **Step 5: Gerar as molduras finais com o Codex (manual, substitui os placeholders)**

Para **cada** candidato da lista (`lula`, `flavio-bolsonaro`, `ronaldo-caiado`, `zema`, `samara`, `augusto-cury`), peça ao Codex (ou ao gerador de imagem de sua preferência) com este prompt, trocando `NOME`, `NÚMERO` e `CORES` pelos valores de `common/src/candidates.ts`:

```
Crie um PNG quadrado de 1080x1080 px com FUNDO TRANSPARENTE: uma moldura circular
de foto de perfil para apoio eleitoral. Um anel de 140 px de espessura toca as bordas
do quadrado (círculo externo de diâmetro 1080). O CENTRO do círculo (raio 400 px) deve
ser 100% transparente, e os 4 cantos fora do círculo também. No anel, o texto "NOME"
curvado em arco no topo, em branco, negrito. Embaixo, uma bolinha com o número
"NÚMERO". Cores do anel: CORES. Estilo limpo e moderno, bandeira do Brasil como
inspiração. NÃO desenhe rostos, pessoas, mãos, logos, símbolos de partido ou fotos.
```

Salve cada resultado em `api/assets/frames/<id>.png` (sobrescrevendo o placeholder). Depois rode:

Run: `pnpm --filter @moldura/api test`
Expected: os 6 testes `assets/frames/<id>.png existe e é válida` PASS. Se algum falhar (modelos de imagem erram geometria), o teste diz o problema: peça ao Codex para corrigir ou mantenha o placeholder daquele candidato. **Confira o nome e o número escritos em cada imagem** (modelos de imagem erram texto) antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): molduras placeholder, validador e molduras dos candidatos"
```

---

### Task 5: Montagem da imagem final (`sharp`)

**Files:**
- Create: `api/src/modules/orders/services/photo.ts`, `api/src/modules/orders/services/compose.ts`, `api/src/modules/orders/compose.check.ts`

**Interfaces:**
- Consumes: `placePhoto`, `innerRadius`, `FRAME_SIZE`, `Framing`, `pixelAt`, `assets/frames/<id>.png`.
- Produces:
  - `class InvalidPhotoError extends Error`; `normalizePhoto(input: Buffer): Promise<Buffer>` (JPEG, lado máx. 2000, já orientada) em `@/modules/orders/services/photo`
  - `composeImage(photo: Buffer, framing: Framing, framePath: string): Promise<Buffer>` (PNG 1080×1080) em `@/modules/orders/services/compose`

- [ ] **Step 1: Escrever o teste que falha**

`api/src/modules/orders/compose.check.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";
import { composeImage } from "@/modules/orders/services/compose";
import { InvalidPhotoError, normalizePhoto } from "@/modules/orders/services/photo";
import { pixelAt } from "@/scripts/fixtures/pixels";

const FRAME = path.resolve("assets/frames/flavio-bolsonaro.png");

async function solidPhoto(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
}

test("monta PNG 1080x1080 com a foto no centro e a moldura no anel", async () => {
  const photo = await normalizePhoto(await solidPhoto(600, 400));
  const out = await composeImage(photo, { zoom: 1, offsetX: 0, offsetY: 0 }, FRAME);
  const meta = await sharp(out).metadata();

  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);

  const center = await pixelAt(out, 540, 540);
  assert.ok(center.r > 150 && center.g < 80 && center.a === 255, "centro deve ser a foto vermelha");

  const ring = await pixelAt(out, 540, 70);
  assert.equal(ring.a, 255);
  assert.ok(ring.b > ring.r, "anel deve ter a cor azul da moldura");

  const corner = await pixelAt(out, 3, 3);
  assert.equal(corner.a, 0);
});

test("enquadramento extremo (foto não cobre o círculo) monta sem erro", async () => {
  const photo = await normalizePhoto(await solidPhoto(300, 300));

  const out = await composeImage(photo, { zoom: 1, offsetX: 1, offsetY: -1 }, FRAME);
  const meta = await sharp(out).metadata();

  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);
});

test("normalizePhoto rejeita bytes que não são imagem", async () => {
  await assert.rejects(normalizePhoto(Buffer.from("isto não é uma imagem")), InvalidPhotoError);
});

test("normalizePhoto limita o lado maior a 2000 px", async () => {
  const big = await solidPhoto(4000, 3000);
  const normalized = await normalizePhoto(big);
  const meta = await sharp(normalized).metadata();

  assert.equal(meta.width, 2000);
  assert.equal(meta.height, 1500);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @moldura/api test`
Expected: FAIL (módulos `services/photo` e `services/compose` não existem).

- [ ] **Step 3: Implementar**

`api/src/modules/orders/services/photo.ts`:

```ts
import sharp from "sharp";

const MAX_PHOTO_SIDE = 2000;

export class InvalidPhotoError extends Error {}

export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize(MAX_PHOTO_SIDE, MAX_PHOTO_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new InvalidPhotoError("Não consegui ler essa foto. Tente outra.");
  }
}
```

`api/src/modules/orders/services/compose.ts`:

```ts
import sharp from "sharp";
import { FRAME_SIZE, innerRadius, placePhoto } from "@moldura/common";
import type { Framing } from "@moldura/common";

const BACKGROUND = { r: 229, g: 231, b: 235, alpha: 1 };

export async function composeImage(photo: Buffer, framing: Framing, framePath: string): Promise<Buffer> {
  const size = FRAME_SIZE;
  const oriented = await sharp(photo).rotate().toBuffer({ resolveWithObject: true });

  const placement = placePhoto({
    imageWidth: oriented.info.width,
    imageHeight: oriented.info.height,
    zoom: framing.zoom,
    offsetX: framing.offsetX,
    offsetY: framing.offsetY,
    size,
  });

  const width = Math.round(placement.width);
  const height = Math.round(placement.height);
  const left = Math.round(placement.left);
  const top = Math.round(placement.top);

  const visibleLeft = Math.max(0, left);
  const visibleTop = Math.max(0, top);
  const visibleRight = Math.min(size, left + width);
  const visibleBottom = Math.min(size, top + height);

  const layers: sharp.OverlayOptions[] = [];

  if (visibleRight > visibleLeft && visibleBottom > visibleTop) {
    const scaled = await sharp(oriented.data).resize(width, height, { fit: "fill" }).toBuffer();

    const crop = await sharp(scaled)
      .extract({
        left: visibleLeft - left,
        top: visibleTop - top,
        width: visibleRight - visibleLeft,
        height: visibleBottom - visibleTop,
      })
      .toBuffer();

    layers.push({ input: crop, left: visibleLeft, top: visibleTop });
  }

  const base = await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite(layers)
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${innerRadius(size)}" fill="#fff"/></svg>`,
  );

  const photoCircle = await sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const frame = await sharp(framePath).resize(size, size).png().toBuffer();

  return sharp(photoCircle)
    .composite([{ input: frame }])
    .png()
    .toBuffer();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @moldura/api test` e `pnpm --filter @moldura/api typecheck`
Expected: PASS; sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): normalização da foto e montagem da imagem final"
```

---

### Task 6: Cliente da AbacatePay e gateway falso

**Files:**
- Create: `api/src/modules/payments/gateway.ts`, `api/src/modules/payments/abacatepay.ts`, `api/src/modules/payments/abacatepay.check.ts`, `api/src/scripts/fixtures/fake-gateway.ts`

**Interfaces:**
- Produces:
  - `type PixStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED"`
  - `type CreatePixInput = { amountCents: number; description: string; expiresInSeconds: number }`
  - `type CreatedPix = { id: string; brCode: string; brCodeBase64: string; expiresAt: Date }`
  - `interface PixGateway { createPix(input: CreatePixInput): Promise<CreatedPix>; checkPix(id: string): Promise<PixStatus> }` em `@/modules/payments/gateway`
  - `createAbacatePayGateway(options: { apiKey: string; baseUrl: string; fetchFn?: typeof fetch }): PixGateway`
  - `createFakeGateway(): FakeGateway` (PixGateway + `statuses: Map<string, PixStatus>`, `inputs: CreatePixInput[]`, `created: string[]`, `failCreate: boolean`, `failCheck: boolean`)

- [ ] **Step 1: Conferir a documentação oficial da AbacatePay (obrigatório antes de codar)**

A spec marcou os endpoints abaixo como vindos do código do `talkify-app`, não da documentação. Abra a documentação oficial da AbacatePay e confirme: URL base e versão; endpoint e corpo de criação de Pix (QR Code Pix); campos da resposta (`id`, `brCode`, `brCodeBase64`, `expiresAt`); endpoint e valores de status; nomes dos eventos de webhook de pagamento e como o webhook se autentica. Se algo diferir do que está neste plano, ajuste **somente** `abacatepay.ts`, `abacatepay.check.ts` e a lista `PAID_EVENTS` da Task 8, e anote a diferença no `README.md`.

- [ ] **Step 2: Escrever o teste que falha**

`api/src/modules/payments/abacatepay.check.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAbacatePayGateway } from "@/modules/payments/abacatepay";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(responses: Array<{ status: number; json: unknown }>) {
  const calls: Call[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const response = responses.shift();

    if (!response) {
      throw new Error("sem resposta simulada");
    }

    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    return new Response(JSON.stringify(response.json), { status: response.status });
  };

  return { fetchFn, calls };
}

test("createPix envia o corpo certo e entende a resposta embrulhada em data", async () => {
  const { fetchFn, calls } = fakeFetch([
    { status: 200, json: { data: { id: "pix_1", brCode: "000201", brCodeBase64: "QUJD", expiresAt: "2026-10-03T12:30:00.000Z" }, error: null } },
  ]);
  const gateway = createAbacatePayGateway({ apiKey: "k-123", baseUrl: "https://api.example.com/v2", fetchFn });

  const pix = await gateway.createPix({ amountCents: 399, description: "Moldura Eleitoral", expiresInSeconds: 1800 });

  assert.equal(calls[0].url, "https://api.example.com/v2/transparents/create");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.authorization, "Bearer k-123");
  assert.deepEqual(calls[0].body, { method: "PIX", data: { amount: 399, description: "Moldura Eleitoral", expiresIn: 1800 } });
  assert.equal(pix.id, "pix_1");
  assert.equal(pix.brCode, "000201");
  assert.equal(pix.expiresAt.toISOString(), "2026-10-03T12:30:00.000Z");
});

test("createPix aceita resposta sem o embrulho data", async () => {
  const { fetchFn } = fakeFetch([
    { status: 200, json: { id: "pix_2", brCode: "000202", brCodeBase64: "QUJD", expiresAt: "2026-10-03T12:30:00.000Z" } },
  ]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  const pix = await gateway.createPix({ amountCents: 399, description: "d", expiresInSeconds: 60 });

  assert.equal(pix.id, "pix_2");
});

test("checkPix consulta pelo id e devolve o status", async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { data: { status: "PAID" } } }]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  const status = await gateway.checkPix("pix 1/2");

  assert.equal(status, "PAID");
  assert.equal(calls[0].url, "https://x/v2/transparents/check?id=pix%201%2F2");
  assert.equal(calls[0].method, "GET");
});

test("resposta de erro vira exceção sem vazar a chave", async () => {
  const { fetchFn } = fakeFetch([{ status: 401, json: { error: "unauthorized" } }]);
  const gateway = createAbacatePayGateway({ apiKey: "segredo-da-chave", baseUrl: "https://x/v2", fetchFn });

  await assert.rejects(
    gateway.checkPix("pix_1"),
    (error: Error) => error.message.includes("401") && !error.message.includes("segredo-da-chave"),
  );
});

test("status desconhecido é rejeitado", async () => {
  const { fetchFn } = fakeFetch([{ status: 200, json: { data: { status: "WHATEVER" } } }]);
  const gateway = createAbacatePayGateway({ apiKey: "k", baseUrl: "https://x/v2", fetchFn });

  await assert.rejects(gateway.checkPix("pix_1"));
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @moldura/api test`
Expected: FAIL (`abacatepay` não existe).

- [ ] **Step 4: Implementar**

`api/src/modules/payments/gateway.ts`:

```ts
export type PixStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export type CreatePixInput = {
  amountCents: number;
  description: string;
  expiresInSeconds: number;
};

export type CreatedPix = {
  id: string;
  brCode: string;
  brCodeBase64: string;
  expiresAt: Date;
};

export interface PixGateway {
  createPix(input: CreatePixInput): Promise<CreatedPix>;
  checkPix(id: string): Promise<PixStatus>;
}
```

`api/src/modules/payments/abacatepay.ts`:

```ts
import { z } from "zod";
import type { CreatedPix, PixGateway, PixStatus } from "@/modules/payments/gateway";

const CreatedPixSchema = z.object({
  id: z.string(),
  brCode: z.string(),
  brCodeBase64: z.string(),
  expiresAt: z.string(),
});

const CheckPixSchema = z.object({
  status: z.enum(["PENDING", "PAID", "EXPIRED", "CANCELLED", "REFUNDED"]),
});

export type AbacatePayOptions = {
  apiKey: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
};

function unwrap(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in json && json.data) {
    return json.data;
  }

  return json;
}

export function createAbacatePayGateway(options: AbacatePayOptions): PixGateway {
  const fetchFn = options.fetchFn ?? fetch;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetchFn(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`AbacatePay respondeu ${response.status} em ${path.split("?")[0]}`);
    }

    const json: unknown = await response.json();

    return unwrap(json);
  }

  return {
    async createPix(input): Promise<CreatedPix> {
      const data = await request("/transparents/create", {
        method: "POST",
        body: JSON.stringify({
          method: "PIX",
          data: { amount: input.amountCents, description: input.description, expiresIn: input.expiresInSeconds },
        }),
      });
      const parsed = CreatedPixSchema.parse(data);

      return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
    },

    async checkPix(id): Promise<PixStatus> {
      const data = await request(`/transparents/check?id=${encodeURIComponent(id)}`, { method: "GET" });

      return CheckPixSchema.parse(data).status;
    },
  };
}
```

`api/src/scripts/fixtures/fake-gateway.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { CreatePixInput, PixGateway, PixStatus } from "@/modules/payments/gateway";

export type FakeGateway = PixGateway & {
  statuses: Map<string, PixStatus>;
  inputs: CreatePixInput[];
  created: string[];
  failCreate: boolean;
  failCheck: boolean;
};

export function createFakeGateway(): FakeGateway {
  const gateway: FakeGateway = {
    statuses: new Map(),
    inputs: [],
    created: [],
    failCreate: false,
    failCheck: false,

    async createPix(input) {
      if (gateway.failCreate) {
        throw new Error("gateway fora do ar");
      }

      const id = `pix_${randomUUID().slice(0, 8)}`;
      gateway.statuses.set(id, "PENDING");
      gateway.inputs.push(input);
      gateway.created.push(id);

      return {
        id,
        brCode: `000201-${id}`,
        brCodeBase64: "QUJD",
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      };
    },

    async checkPix(id) {
      if (gateway.failCheck) {
        throw new Error("gateway fora do ar");
      }

      return gateway.statuses.get(id) ?? "PENDING";
    },
  };

  return gateway;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @moldura/api test` e `pnpm --filter @moldura/api typecheck`
Expected: PASS; sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): cliente da AbacatePay e gateway falso para testes"
```

---

### Task 7: Pedidos (criar, consultar, sincronizar) e o app Fastify

**Files:**
- Create: `api/src/modules/orders/context.ts`, `api/src/modules/orders/services/create-order.ts`, `api/src/modules/orders/services/sync-order.ts`, `api/src/modules/orders/services/order-view.ts`, `api/src/modules/orders/routes/orders.router.ts`, `api/src/modules/payments/webhook.router.ts` (stub vazio nesta tarefa, preenchido na Task 8), `api/src/app.ts`, `api/src/scripts/fixtures/test-app.ts`, `api/src/modules/orders/orders.check.ts`

**Interfaces:**
- Consumes: `Database`, `Storage`, `PixGateway`, `Logger`, `composeImage`, `normalizePhoto`, `InvalidPhotoError`, `OrderRow`, helpers HTTP, constantes de `@moldura/common`.
- Produces:
  - `type OrderContext = { db: Database; storage: Storage; gateway: PixGateway; framesDir: string; logger: Logger; now: () => Date }` em `@/modules/orders/context`
  - `class GatewayError extends Error`; `createOrder(ctx, input: { candidateId: string; framing: Framing; photo: Buffer; ipAddress: string }): Promise<OrderRow>`
  - `findOrder(ctx, id): Promise<OrderRow | null>`; `confirmOrder(ctx, row): Promise<OrderRow>`; `syncOrder(ctx, id): Promise<OrderRow | null>` (reconsulta a AbacatePay; lança se o gateway falhar); `refreshOrder(ctx, id): Promise<OrderRow | null>` (igual, mas engole falha do gateway e devolve o estado local)
  - `toOrderView(ctx, row): Promise<Order>`
  - `ordersRouter(ctx: OrderContext, ordersPerMinute: number): FastifyPluginAsync`; `webhookRouter(ctx: OrderContext, secret: string): FastifyPluginAsync`
  - `buildApp(deps: { ctx: OrderContext; webhookSecret: string; webOrigin: string; trustProxy: boolean; ordersPerMinute: number }): Promise<FastifyInstance>`
  - `createTestApp(options?: { now?: () => Date; ordersPerMinute?: number; framesDir?: string; logStream?: DestinationStream }): Promise<TestApp>` e `WEBHOOK_SECRET` em `@/scripts/fixtures/test-app`; `TestApp = { app; ctx; db; storage: MemoryStorage; gateway: FakeGateway; close(): Promise<void> }`

- [ ] **Step 1: Fixture do app de teste e o teste que falha**

`api/src/modules/orders/context.ts`:

```ts
import type { Database } from "@/core/db";
import type { Logger } from "@/core/logger";
import type { Storage } from "@/core/storage";
import type { PixGateway } from "@/modules/payments/gateway";

export type OrderContext = {
  db: Database;
  storage: Storage;
  gateway: PixGateway;
  framesDir: string;
  logger: Logger;
  now: () => Date;
};
```

`api/src/scripts/fixtures/test-app.ts`:

```ts
import path from "node:path";
import type { DestinationStream } from "pino";
import { buildApp } from "@/app";
import { createDb } from "@/core/db";
import { createLogger } from "@/core/logger";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";
import { createFakeGateway } from "@/scripts/fixtures/fake-gateway";
import { createMemoryStorage } from "@/scripts/fixtures/memory-storage";

export const WEBHOOK_SECRET = "test-webhook-secret-123456";

export type TestAppOptions = {
  now?: () => Date;
  ordersPerMinute?: number;
  framesDir?: string;
  logStream?: DestinationStream;
};

export async function createTestApp(options: TestAppOptions = {}) {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "");
  const storage = createMemoryStorage();
  const gateway = createFakeGateway();

  const ctx: OrderContext = {
    db,
    storage,
    gateway,
    framesDir: options.framesDir ?? path.resolve("assets/frames"),
    logger: createLogger(options.logStream),
    now: options.now ?? (() => new Date()),
  };

  await db.delete(orders);
  await db.delete(webhookEvents);

  const app = await buildApp({
    ctx,
    webhookSecret: WEBHOOK_SECRET,
    webOrigin: "http://localhost:6610",
    trustProxy: false,
    ordersPerMinute: options.ordersPerMinute ?? 1000,
  });

  return {
    app,
    ctx,
    db,
    storage,
    gateway,
    async close() {
      await app.close();
      await sql.end();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
```

`api/src/modules/orders/orders.check.ts`:

```ts
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.close();
});

async function photo() {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
}

async function multipart(fields: Record<string, string>, file?: { data: Buffer; type: string }) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  if (file) {
    form.append("photo", new Blob([new Uint8Array(file.data)], { type: file.type }), "foto.jpg");
  }

  const request = new Request("http://localhost", { method: "POST", body: form });

  return {
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  };
}

const FRAMING = JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 });

async function postOrder(fields: Record<string, string>, file?: { data: Buffer; type: string }) {
  const body = await multipart(fields, file);

  return t.app.inject({ method: "POST", url: "/orders", ...body });
}

test("POST /orders cria pedido pending com Pix de 399 centavos e guarda a foto", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" });
  const body = res.json();

  assert.equal(res.statusCode, 201);
  assert.equal(body.status, "pending");
  assert.equal(body.candidateId, "lula");
  assert.ok(body.pix.brCode.startsWith("000201-"));
  assert.equal(body.downloadUrl, null);
  assert.equal(t.gateway.inputs[0].amountCents, 399);
  assert.equal(t.gateway.inputs[0].expiresInSeconds, 1800);
  assert.equal(t.storage.files.size, 1);
  assert.ok([...t.storage.files.keys()][0].startsWith("photos/"));
});

test("POST /orders rejeita candidato inválido, framing inválido e falta de foto", async () => {
  const file = { data: await photo(), type: "image/jpeg" };

  assert.equal((await postOrder({ candidateId: "x", framing: FRAMING }, file)).statusCode, 400);
  assert.equal((await postOrder({ candidateId: "lula", framing: "nao-json" }, file)).statusCode, 400);
  assert.equal((await postOrder({ candidateId: "lula", framing: JSON.stringify({ zoom: 9, offsetX: 0, offsetY: 0 }) }, file)).statusCode, 400);
  assert.equal((await postOrder({ candidateId: "lula", framing: FRAMING })).statusCode, 400);
  assert.equal(t.storage.files.size, 0);
});

test("POST /orders com arquivo que não é imagem (mas diz image/jpeg) devolve 400", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: Buffer.from("isto nao e imagem"), type: "image/jpeg" });

  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /foto/i);
  assert.equal(t.storage.files.size, 0);
  assert.equal(t.gateway.created.length, 0);
});

test("POST /orders rejeita tipo de arquivo que não é imagem permitida", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "application/pdf" });

  assert.equal(res.statusCode, 400);
});

test("POST /orders com foto acima de 8 MB devolve 413 e não grava nada", async () => {
  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: Buffer.alloc(9 * 1024 * 1024, 1), type: "image/jpeg" });

  assert.equal(res.statusCode, 413);
  assert.equal(t.storage.files.size, 0);
});

test("POST /orders com a AbacatePay fora do ar devolve 502 e não deixa foto órfã", async () => {
  t.gateway.failCreate = true;

  const res = await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" });

  assert.equal(res.statusCode, 502);
  assert.equal(t.storage.files.size, 0);
});

test("GET /orders/:id com id desconhecido ou que não é uuid devolve 404", async () => {
  const unknown = await t.app.inject({ method: "GET", url: "/orders/6b1f9a52-5a43-4d52-8d52-0a8f2f0a0000" });
  const notUuid = await t.app.inject({ method: "GET", url: "/orders/abc" });

  assert.equal(unknown.statusCode, 404);
  assert.equal(notUuid.statusCode, 404);
});

test("GET /orders/:id pendente mostra o Pix; quando a AbacatePay diz PAID monta a imagem e libera o download", async () => {
  const created = (await postOrder({ candidateId: "flavio-bolsonaro", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();

  const pending = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(pending.status, "pending");
  assert.ok(pending.pix);

  t.gateway.statuses.set(t.gateway.created[0], "PAID");

  const paid = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(paid.status, "paid");
  assert.equal(paid.pix, null);
  assert.ok(paid.downloadUrl.startsWith("memory://results/"));

  const resultKey = [...t.storage.files.keys()].find((key) => key.startsWith("results/"));
  assert.ok(resultKey);
  const meta = await sharp(t.storage.files.get(resultKey)).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);

  assert.equal([...t.storage.files.keys()].some((key) => key.startsWith("photos/")), false, "foto original deve ser apagada");
});

test("GET /orders/:id marca expired quando a AbacatePay diz EXPIRED ou quando passou do prazo local", async () => {
  const a = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "EXPIRED");
  assert.equal((await t.app.inject({ method: "GET", url: `/orders/${a.id}` })).json().status, "expired");

  const later = await createTestApp({ now: () => new Date(Date.now() + 3600_000) });

  try {
    const b = (await later.app.inject({ method: "POST", url: "/orders", ...(await multipart({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })) })).json();
    assert.equal((await later.app.inject({ method: "GET", url: `/orders/${b.id}` })).json().status, "expired");
  } finally {
    await later.close();
  }
});

test("GET /orders/:id com a AbacatePay fora do ar devolve o estado local", async () => {
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.failCheck = true;

  const res = await t.app.inject({ method: "GET", url: `/orders/${created.id}` });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "pending");
});

test("falha na montagem vira paid_failed e a remontagem funciona depois", async () => {
  t.ctx.framesDir = "C:/pasta/que/nao/existe";
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "PAID");

  const failed = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(failed.status, "paid_failed");
  assert.equal(failed.downloadUrl, null);

  t.ctx.framesDir = (await import("node:path")).resolve("assets/frames");

  const fixed = (await t.app.inject({ method: "GET", url: `/orders/${created.id}` })).json();
  assert.equal(fixed.status, "paid");
  assert.ok(fixed.downloadUrl);
});

test("confirmar duas vezes gera uma só imagem", async () => {
  const created = (await postOrder({ candidateId: "lula", framing: FRAMING }, { data: await photo(), type: "image/jpeg" })).json();
  t.gateway.statuses.set(t.gateway.created[0], "PAID");

  await t.app.inject({ method: "GET", url: `/orders/${created.id}` });
  await t.app.inject({ method: "GET", url: `/orders/${created.id}` });

  const results = t.storage.puts.filter((key) => key.startsWith("results/"));
  assert.equal(results.length, 1);

  const [row] = await t.db.select().from(orders).where(eq(orders.id, created.id));
  assert.equal(row.status, "paid");
  assert.equal(row.photoKey, null);
});

test("POST /orders respeita o limite por IP", async () => {
  const limited = await createTestApp({ ordersPerMinute: 2 });

  try {
    const file = { data: await photo(), type: "image/jpeg" };
    const send = async () => limited.app.inject({ method: "POST", url: "/orders", ...(await multipart({ candidateId: "lula", framing: FRAMING }, file)) });

    assert.equal((await send()).statusCode, 201);
    assert.equal((await send()).statusCode, 201);
    assert.equal((await send()).statusCode, 429);
  } finally {
    await limited.close();
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @moldura/api test`
Expected: FAIL (`@/app` não existe).

- [ ] **Step 3: Serviços**

`api/src/modules/orders/services/order-view.ts`:

```ts
import { DOWNLOAD_URL_SECONDS } from "@moldura/common";
import type { Order } from "@moldura/common";
import type { OrderContext } from "@/modules/orders/context";
import type { OrderRow } from "@/modules/orders/schema";

export async function toOrderView(ctx: OrderContext, row: OrderRow): Promise<Order> {
  const pix =
    row.status === "pending"
      ? { brCode: row.pixBrCode, brCodeBase64: row.pixBrCodeBase64, expiresAt: row.expiresAt.toISOString() }
      : null;

  const downloadUrl =
    row.status === "paid" && row.resultKey ? await ctx.storage.signedUrl(row.resultKey, DOWNLOAD_URL_SECONDS) : null;

  return { id: row.id, status: row.status, candidateId: row.candidateId, pix, downloadUrl };
}
```

`api/src/modules/orders/services/create-order.ts`:

```ts
import { randomUUID } from "node:crypto";
import { PIX_EXPIRES_SECONDS, PRICE_CENTS } from "@moldura/common";
import type { Framing } from "@moldura/common";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { normalizePhoto } from "@/modules/orders/services/photo";
import type { CreatedPix } from "@/modules/payments/gateway";

export class GatewayError extends Error {}

export type CreateOrderInput = {
  candidateId: string;
  framing: Framing;
  photo: Buffer;
  ipAddress: string;
};

export async function createOrder(ctx: OrderContext, input: CreateOrderInput): Promise<OrderRow> {
  const photo = await normalizePhoto(input.photo);
  const id = randomUUID();
  const photoKey = `photos/${id}.jpg`;

  await ctx.storage.put(photoKey, photo, "image/jpeg");

  let pix: CreatedPix;

  try {
    pix = await ctx.gateway.createPix({
      amountCents: PRICE_CENTS,
      description: "Moldura Eleitoral",
      expiresInSeconds: PIX_EXPIRES_SECONDS,
    });
  } catch (error) {
    ctx.logger.error({ err: error }, "Falha ao criar o Pix");
    await ctx.storage.remove(photoKey);
    throw new GatewayError("Não foi possível gerar o Pix agora. Tente de novo em instantes.");
  }

  const [row] = await ctx.db
    .insert(orders)
    .values({
      id,
      candidateId: input.candidateId,
      photoKey,
      framing: input.framing,
      pixId: pix.id,
      pixBrCode: pix.brCode,
      pixBrCodeBase64: pix.brCodeBase64,
      ipAddress: input.ipAddress,
      expiresAt: pix.expiresAt,
    })
    .returning();

  if (!row) {
    throw new Error("Falha ao gravar o pedido.");
  }

  return row;
}
```

`api/src/modules/orders/services/sync-order.ts`:

```ts
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import type { OrderRow } from "@/modules/orders/schema";
import { composeImage } from "@/modules/orders/services/compose";

export async function findOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  const [row] = await ctx.db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return row ?? null;
}

async function updateOrder(ctx: OrderContext, id: string, values: Partial<typeof orders.$inferInsert>): Promise<OrderRow | null> {
  const [row] = await ctx.db
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, id), ne(orders.status, "paid")))
    .returning();

  if (row) {
    return row;
  }

  return findOrder(ctx, id);
}

async function removeQuietly(ctx: OrderContext, key: string): Promise<void> {
  try {
    await ctx.storage.remove(key);
  } catch (error) {
    ctx.logger.warn({ err: error, key }, "Não consegui apagar o arquivo");
  }
}

export async function confirmOrder(ctx: OrderContext, row: OrderRow): Promise<OrderRow> {
  if (row.status === "paid") {
    return row;
  }

  try {
    if (!row.photoKey) {
      throw new Error("Foto do pedido não encontrada.");
    }

    const photo = await ctx.storage.get(row.photoKey);
    const framePath = path.join(ctx.framesDir, `${row.candidateId}.png`);
    const image = await composeImage(photo, row.framing, framePath);
    const resultKey = `results/${row.id}.png`;

    await ctx.storage.put(resultKey, image, "image/png");

    const paid = await updateOrder(ctx, row.id, { status: "paid", resultKey, photoKey: null, paidAt: ctx.now() });
    await removeQuietly(ctx, row.photoKey);

    return paid ?? row;
  } catch (error) {
    ctx.logger.error({ err: error, orderId: row.id }, "Falha ao montar a imagem do pedido");

    const failed = await updateOrder(ctx, row.id, { status: "paid_failed" });

    return failed ?? row;
  }
}

export async function syncOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  const row = await findOrder(ctx, id);

  if (!row) {
    return null;
  }

  if (row.status === "paid" || row.status === "expired") {
    return row;
  }

  const pixStatus = await ctx.gateway.checkPix(row.pixId);

  if (pixStatus === "PAID") {
    return confirmOrder(ctx, row);
  }

  if (row.status === "paid_failed") {
    return row;
  }

  if (pixStatus === "EXPIRED" || pixStatus === "CANCELLED" || ctx.now() > row.expiresAt) {
    return updateOrder(ctx, row.id, { status: "expired" });
  }

  return row;
}

export async function refreshOrder(ctx: OrderContext, id: string): Promise<OrderRow | null> {
  try {
    return await syncOrder(ctx, id);
  } catch (error) {
    ctx.logger.warn({ err: error, orderId: id }, "Não consegui consultar a AbacatePay; usando o estado local");

    return findOrder(ctx, id);
  }
}
```

- [ ] **Step 4: Rotas e app**

`api/src/modules/orders/routes/orders.router.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateOrderSchema, PHOTO_MIME_TYPES } from "@moldura/common";
import { badGateway, badReq, created, notFound, ok } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { GatewayError, createOrder } from "@/modules/orders/services/create-order";
import { toOrderView } from "@/modules/orders/services/order-view";
import { InvalidPhotoError } from "@/modules/orders/services/photo";
import { refreshOrder } from "@/modules/orders/services/sync-order";

const ParamsSchema = z.object({ id: z.uuid() });

function fieldValue(field: unknown): string | undefined {
  if (field && typeof field === "object" && "type" in field && field.type === "field" && "value" in field) {
    return typeof field.value === "string" ? field.value : undefined;
  }

  return undefined;
}

function parseJson(text: string | undefined): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function ordersRouter(ctx: OrderContext, ordersPerMinute: number): FastifyPluginAsync {
  return async (app) => {
    app.post("/", { config: { rateLimit: { max: ordersPerMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
      const file = await req.file();

      if (!file) {
        return badReq(reply, "Envie uma foto.");
      }

      if (!PHOTO_MIME_TYPES.includes(file.mimetype)) {
        return badReq(reply, "A foto precisa ser JPG, PNG ou WebP.");
      }

      const parsed = CreateOrderSchema.safeParse({
        candidateId: fieldValue(file.fields.candidateId),
        framing: parseJson(fieldValue(file.fields.framing)),
      });

      if (!parsed.success) {
        return badReq(reply, "Dados do pedido inválidos.");
      }

      const photo = await file.toBuffer();

      try {
        const row = await createOrder(ctx, { ...parsed.data, photo, ipAddress: req.ip });
        const view = await toOrderView(ctx, row);

        return created(reply, view);
      } catch (error) {
        if (error instanceof InvalidPhotoError) {
          return badReq(reply, error.message);
        }

        if (error instanceof GatewayError) {
          return badGateway(reply, error.message);
        }

        throw error;
      }
    });

    app.get("/:id", async (req, reply) => {
      const params = ParamsSchema.safeParse(req.params);

      if (!params.success) {
        return notFound(reply, "Pedido não encontrado.");
      }

      const row = await refreshOrder(ctx, params.data.id);

      if (!row) {
        return notFound(reply, "Pedido não encontrado.");
      }

      const view = await toOrderView(ctx, row);

      return ok(reply, view);
    });
  };
}
```

`api/src/modules/payments/webhook.router.ts` (stub; a Task 8 substitui o corpo):

```ts
import type { FastifyPluginAsync } from "fastify";
import type { OrderContext } from "@/modules/orders/context";

export function webhookRouter(_ctx: OrderContext, _secret: string): FastifyPluginAsync {
  return async () => {};
}
```

`api/src/app.ts`:

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { PHOTO_MAX_BYTES } from "@moldura/common";
import { serverErr, tooLarge } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { ordersRouter } from "@/modules/orders/routes/orders.router";
import { webhookRouter } from "@/modules/payments/webhook.router";

export type AppDeps = {
  ctx: OrderContext;
  webhookSecret: string;
  webOrigin: string;
  trustProxy: boolean;
  ordersPerMinute: number;
};

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    loggerInstance: deps.ctx.logger,
    trustProxy: deps.trustProxy,
    bodyLimit: PHOTO_MAX_BYTES + 1024 * 1024,
  });

  await app.register(cors, { origin: deps.webOrigin });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { files: 1, fields: 5, fileSize: PHOTO_MAX_BYTES } });

  app.setErrorHandler((error, req, reply) => {
    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return tooLarge(reply, "A foto passa de 8 MB.");
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    req.log.error(error);

    return serverErr(reply);
  });

  app.get("/healthz", async () => ({ ok: true }));

  await app.register(ordersRouter(deps.ctx, deps.ordersPerMinute), { prefix: "/orders" });
  await app.register(webhookRouter(deps.ctx, deps.webhookSecret), { prefix: "/webhooks" });

  return app;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @moldura/api test` e `pnpm --filter @moldura/api typecheck`
Expected: todos PASS. Se o teste do limite de 8 MB falhar com 400 ou 500 em vez de 413, confirme o `error.code` real impresso pelo plugin `@fastify/multipart` (`FST_REQ_FILE_TOO_LARGE`) e ajuste só o `if` do `setErrorHandler`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): pedidos com Pix, sincronização com a AbacatePay e app Fastify"
```

---

### Task 8: Webhook da AbacatePay

**Files:**
- Modify: `api/src/modules/payments/webhook.router.ts` (substitui o stub)
- Create: `api/src/modules/payments/webhook.check.ts`

**Interfaces:**
- Consumes: `syncOrder`, `OrderContext`, `webhookEvents`, `orders`, `createTestApp`, `WEBHOOK_SECRET`.
- Produces: `POST /webhooks/abacatepay?webhookSecret=...` — 401 sem segredo certo; 200 sempre depois de autenticado e registrado. Eventos de pagamento aceitos: `transparent.completed`, `billing.paid`, `checkout.completed`.

- [ ] **Step 1: Escrever o teste que falha**

`api/src/modules/payments/webhook.check.ts`:

```ts
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { orders } from "@/modules/orders/schema";
import { webhookEvents } from "@/modules/payments/schema";
import { WEBHOOK_SECRET, createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;
let logs = "";

beforeEach(async () => {
  logs = "";
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });

  t = await createTestApp({ logStream });
});

afterEach(async () => {
  await t.close();
});

async function createPendingOrder() {
  const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 10, g: 10, b: 200 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("candidateId", "lula");
  form.append("framing", JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0 }));
  form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "foto.jpg");
  const request = new Request("http://localhost", { method: "POST", body: form });

  const res = await t.app.inject({
    method: "POST",
    url: "/orders",
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  });

  return { orderId: res.json().id as string, pixId: t.gateway.created[t.gateway.created.length - 1] };
}

function webhook(body: unknown, secret: string | null = WEBHOOK_SECRET) {
  const query = secret === null ? "" : `?webhookSecret=${secret}`;

  return t.app.inject({ method: "POST", url: `/webhooks/abacatepay${query}`, payload: body as object });
}

async function statusOf(orderId: string) {
  const [row] = await t.db.select().from(orders).where(eq(orders.id, orderId));

  return row.status;
}

test("sem segredo ou com segredo errado devolve 401 e não registra evento", async () => {
  const { pixId } = await createPendingOrder();
  const body = { event: "transparent.completed", data: { id: pixId } };

  assert.equal((await webhook(body, null)).statusCode, 401);
  assert.equal((await webhook(body, "errado")).statusCode, 401);
  assert.equal((await t.db.select().from(webhookEvents)).length, 0);
});

test("evento de pago com a AbacatePay confirmando PAID libera o pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  const res = await webhook({ event: "transparent.completed", data: { id: pixId } });

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(orderId), "paid");
});

test("webhook repetido é idempotente: uma só imagem", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  const body = { event: "transparent.completed", data: { id: pixId } };

  const first = await webhook(body);
  const second = await webhook(body);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().duplicate, true);
  assert.equal(t.storage.puts.filter((key) => key.startsWith("results/")).length, 1);
  assert.equal(await statusOf(orderId), "paid");
});

test("webhook de pago forjado (AbacatePay diz PENDING) não libera o pedido", async () => {
  const { orderId, pixId } = await createPendingOrder();

  const res = await webhook({ event: "transparent.completed", data: { id: pixId } });

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(orderId), "pending");
  assert.equal(t.storage.puts.filter((key) => key.startsWith("results/")).length, 0);
});

test("evento desconhecido e Pix desconhecido respondem 200 sem mexer em nada", async () => {
  const { orderId } = await createPendingOrder();

  const other = await webhook({ event: "billing.something", data: { id: "x" } });
  const unknownPix = await webhook({ event: "transparent.completed", data: { id: "pix_que_nao_existe" } });

  assert.equal(other.statusCode, 200);
  assert.equal(unknownPix.statusCode, 200);
  assert.equal(unknownPix.json().processed, false);
  assert.equal(await statusOf(orderId), "pending");
});

test("a AbacatePay fora do ar no webhook responde 200 e o polling resolve depois", async () => {
  const { orderId, pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");
  t.gateway.failCheck = true;

  const res = await webhook({ event: "billing.paid", data: { id: pixId } });

  assert.equal(res.statusCode, 200);
  assert.equal(await statusOf(orderId), "pending");

  t.gateway.failCheck = false;
  await t.app.inject({ method: "GET", url: `/orders/${orderId}` });

  assert.equal(await statusOf(orderId), "paid");
});

test("o segredo do webhook não aparece nos logs", async () => {
  const { pixId } = await createPendingOrder();
  t.gateway.statuses.set(pixId, "PAID");

  await webhook({ event: "transparent.completed", data: { id: pixId } });
  await webhook({ event: "transparent.completed", data: { id: pixId } }, "errado");

  assert.ok(logs.length > 0, "o teste precisa capturar logs");
  assert.equal(logs.includes(WEBHOOK_SECRET), false);
  assert.equal(logs.includes("webhookSecret"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @moldura/api test`
Expected: FAIL (o stub não responde nada útil: 404 nas rotas).

- [ ] **Step 3: Implementar**

`api/src/modules/payments/webhook.router.ts`:

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { badReq, ok, unauthorized } from "@/core/http-fastify";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";
import { syncOrder } from "@/modules/orders/services/sync-order";
import { webhookEvents } from "@/modules/payments/schema";

const PAID_EVENTS = new Set(["transparent.completed", "billing.paid", "checkout.completed"]);
const MAX_DEPTH = 6;

const QuerySchema = z.object({
  webhookSecret: z.string().optional(),
  secret: z.string().optional(),
});

const BodySchema = z.object({
  event: z.string(),
  id: z.string().optional(),
  data: z.unknown().optional(),
});

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();

  return timingSafeEqual(hashA, hashB);
}

function collectIds(value: unknown, found: string[] = [], depth = 0): string[] {
  if (depth > MAX_DEPTH || !value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, found, depth + 1);
    }

    return found;
  }

  for (const [key, child] of Object.entries(value)) {
    if ((key === "id" || key === "externalId") && typeof child === "string") {
      found.push(child);
    } else {
      collectIds(child, found, depth + 1);
    }
  }

  return found;
}

export function webhookRouter(ctx: OrderContext, secret: string): FastifyPluginAsync {
  return async (app) => {
    app.post("/abacatepay", async (req, reply) => {
      const query = QuerySchema.safeParse(req.query);
      const provided = query.success ? (query.data.webhookSecret ?? query.data.secret ?? "") : "";

      if (!safeEqual(provided, secret)) {
        return unauthorized(reply, "invalid_secret");
      }

      const body = BodySchema.safeParse(req.body);

      if (!body.success) {
        return badReq(reply, "Evento inválido.");
      }

      const ids = collectIds(req.body);
      const eventId = `${body.data.event}:${body.data.id ?? ids[0] ?? "sem-id"}`;

      const inserted = await ctx.db
        .insert(webhookEvents)
        .values({ eventId, event: body.data.event, payload: req.body })
        .onConflictDoNothing()
        .returning({ eventId: webhookEvents.eventId });

      if (inserted.length === 0) {
        return ok(reply, { received: true, duplicate: true });
      }

      if (!PAID_EVENTS.has(body.data.event)) {
        return ok(reply, { received: true, processed: false });
      }

      const [order] =
        ids.length > 0
          ? await ctx.db
              .select()
              .from(orders)
              .where(inArray(orders.pixId, ids))
              .limit(1)
          : [];

      if (!order) {
        ctx.logger.warn({ event: body.data.event }, "Webhook de pagamento sem pedido correspondente");

        return ok(reply, { received: true, processed: false });
      }

      try {
        await syncOrder(ctx, order.id);
      } catch (error) {
        ctx.logger.error({ err: error, orderId: order.id }, "Falha ao sincronizar o pedido pelo webhook");

        return ok(reply, { received: true, processed: false });
      }

      return ok(reply, { received: true, processed: true });
    });
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @moldura/api test` e `pnpm --filter @moldura/api typecheck`
Expected: todos PASS, incluindo o teste de logs (a rota aparece sem a query string).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): webhook da AbacatePay com segredo, idempotência e reconsulta"
```

---

### Task 9: Limpeza de dados e `main.ts`

**Files:**
- Create: `api/src/modules/orders/services/cleanup.ts`, `api/src/modules/orders/cleanup.check.ts`, `api/src/main.ts`

**Interfaces:**
- Consumes: `OrderContext`, `orders`, `createTestApp`.
- Produces: `cleanupOrders(ctx: OrderContext): Promise<{ removed: number }>` (apaga pedidos `pending`/`expired` com mais de 24 h e a foto deles; apaga a imagem de pedidos `paid` com mais de 7 dias e zera `resultKey`; **não toca em `paid_failed`**); `main.ts` sobe o servidor e roda a limpeza a cada hora.

- [ ] **Step 1: Escrever o teste que falha**

`api/src/modules/orders/cleanup.check.ts`:

```ts
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { orders } from "@/modules/orders/schema";
import { cleanupOrders } from "@/modules/orders/services/cleanup";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

const HOUR = 3600_000;
let clock = Date.now();
let t: TestApp;

beforeEach(async () => {
  clock = Date.now();
  t = await createTestApp({ now: () => new Date(clock) });
});

afterEach(async () => {
  await t.close();
});

async function insertOrder(values: Partial<typeof orders.$inferInsert> & { pixId: string }) {
  const [row] = await t.db
    .insert(orders)
    .values({
      candidateId: "lula",
      framing: { zoom: 1, offsetX: 0, offsetY: 0 },
      pixBrCode: "000",
      pixBrCodeBase64: "QUJD",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(clock + 1800_000),
      ...values,
    })
    .returning();

  return row;
}

test("apaga pedido não pago com mais de 24 h junto com a foto", async () => {
  await t.storage.put("photos/old.jpg", Buffer.from("x"), "image/jpeg");
  const old = await insertOrder({ pixId: "p1", photoKey: "photos/old.jpg", createdAt: new Date(clock - 25 * HOUR) });
  await t.storage.put("photos/new.jpg", Buffer.from("x"), "image/jpeg");
  const fresh = await insertOrder({ pixId: "p2", photoKey: "photos/new.jpg", createdAt: new Date(clock - 1 * HOUR) });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 1);
  assert.equal((await t.db.select().from(orders).where(eq(orders.id, old.id))).length, 0);
  assert.equal(t.storage.files.has("photos/old.jpg"), false);
  assert.equal((await t.db.select().from(orders).where(eq(orders.id, fresh.id))).length, 1);
  assert.equal(t.storage.files.has("photos/new.jpg"), true);
});

test("apaga a imagem de pedido pago com mais de 7 dias e mantém o registro", async () => {
  await t.storage.put("results/a.png", Buffer.from("x"), "image/png");
  const paid = await insertOrder({
    pixId: "p3",
    status: "paid",
    resultKey: "results/a.png",
    paidAt: new Date(clock - 8 * 24 * HOUR),
  });

  await cleanupOrders(t.ctx);

  const [row] = await t.db.select().from(orders).where(eq(orders.id, paid.id));
  assert.equal(row.status, "paid");
  assert.equal(row.resultKey, null);
  assert.equal(t.storage.files.has("results/a.png"), false);
});

test("não mexe em paid_failed, mesmo antigo (dinheiro entrou, dá para remontar)", async () => {
  await t.storage.put("photos/f.jpg", Buffer.from("x"), "image/jpeg");
  const failed = await insertOrder({
    pixId: "p4",
    status: "paid_failed",
    photoKey: "photos/f.jpg",
    createdAt: new Date(clock - 30 * 24 * HOUR),
  });

  const result = await cleanupOrders(t.ctx);

  assert.equal(result.removed, 0);
  assert.equal((await t.db.select().from(orders).where(eq(orders.id, failed.id))).length, 1);
  assert.equal(t.storage.files.has("photos/f.jpg"), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @moldura/api test`
Expected: FAIL (`services/cleanup` não existe).

- [ ] **Step 3: Implementar**

`api/src/modules/orders/services/cleanup.ts`:

```ts
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { OrderContext } from "@/modules/orders/context";
import { orders } from "@/modules/orders/schema";

const HOUR_MS = 3600_000;
const UNPAID_TTL_MS = 24 * HOUR_MS;
const RESULT_TTL_MS = 7 * 24 * HOUR_MS;

async function removeQuietly(ctx: OrderContext, key: string | null): Promise<void> {
  if (!key) {
    return;
  }

  try {
    await ctx.storage.remove(key);
  } catch (error) {
    ctx.logger.warn({ err: error, key }, "Não consegui apagar o arquivo na limpeza");
  }
}

export async function cleanupOrders(ctx: OrderContext): Promise<{ removed: number }> {
  const now = ctx.now().getTime();
  const unpaidBefore = new Date(now - UNPAID_TTL_MS);
  const resultBefore = new Date(now - RESULT_TTL_MS);

  const unpaid = await ctx.db
    .select()
    .from(orders)
    .where(and(inArray(orders.status, ["pending", "expired"]), lt(orders.createdAt, unpaidBefore)));

  for (const row of unpaid) {
    await removeQuietly(ctx, row.photoKey);

    await ctx.db
      .delete(orders)
      .where(eq(orders.id, row.id));
  }

  const stale = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), isNotNull(orders.resultKey), lt(orders.paidAt, resultBefore)));

  for (const row of stale) {
    await removeQuietly(ctx, row.resultKey);

    await ctx.db
      .update(orders)
      .set({ resultKey: null })
      .where(eq(orders.id, row.id));
  }

  return { removed: unpaid.length };
}
```

`api/src/main.ts`:

```ts
import path from "node:path";
import { buildApp } from "@/app";
import { createDb } from "@/core/db";
import { env } from "@/core/env";
import { logger } from "@/core/logger";
import { createMinioStorage } from "@/core/storage";
import type { OrderContext } from "@/modules/orders/context";
import { cleanupOrders } from "@/modules/orders/services/cleanup";
import { createAbacatePayGateway } from "@/modules/payments/abacatepay";

const CLEANUP_INTERVAL_MS = 3600_000;

async function main() {
  const { db, sql } = createDb(env.DATABASE_URL);
  const storage = createMinioStorage();

  await storage.ensureBucket();

  const ctx: OrderContext = {
    db,
    storage,
    gateway: createAbacatePayGateway({ apiKey: env.ABACATEPAY_API_KEY, baseUrl: env.ABACATEPAY_BASE_URL }),
    framesDir: path.resolve("assets/frames"),
    logger,
    now: () => new Date(),
  };

  const app = await buildApp({
    ctx,
    webhookSecret: env.ABACATEPAY_WEBHOOK_SECRET,
    webOrigin: env.WEB_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    ordersPerMinute: 10,
  });

  async function runCleanup() {
    try {
      const result = await cleanupOrders(ctx);
      logger.info(result, "Limpeza concluída");
    } catch (error) {
      logger.error({ err: error }, "Falha na limpeza");
    }
  }

  const timer = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);

  async function shutdown() {
    clearInterval(timer);
    await app.close();
    await sql.end();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error) => {
  logger.error({ err: error }, "Falha ao iniciar");
  process.exit(1);
});
```

- [ ] **Step 4: Rodar testes, typecheck e subir a api de verdade**

Run: `pnpm --filter @moldura/api test` e `pnpm --filter @moldura/api typecheck`
Expected: todos PASS.

Run (em outro terminal): `pnpm --filter @moldura/api db:setup` e depois `pnpm --filter @moldura/api dev`, e então `curl http://localhost:6600/healthz`
Expected: `{"ok":true}`. (Precisa do `api/.env` preenchido do Task 3.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): limpeza de pedidos antigos e ponto de entrada"
```

---

### Task 10: `web` — esqueleto e home

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/.env.example`, `web/scripts/sync-frames.mjs`, `web/src/app/layout.tsx`, `web/src/app/globals.css`, `web/src/app/page.tsx`

**Interfaces:**
- Consumes: `CANDIDATES`, `PRICE_CENTS` de `@moldura/common`; `api/assets/frames/*.png`.
- Produces: `/` (home); `web/public/frames/<id>.png` copiadas pelo script `sync-frames` (rodado em `predev`/`prebuild`); classes CSS globais `.btn`, `.btn.alt`, `.wrap`, `.grid`, `.card`, `.steps`, `.step` usadas também na Task 11.

- [ ] **Step 1: Criar o pacote e instalar**

`web/package.json`:

```json
{
  "name": "@moldura/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "predev": "node scripts/sync-frames.mjs",
    "dev": "next dev -p 6610",
    "prebuild": "node scripts/sync-frames.mjs",
    "build": "next build",
    "start": "next start -p 6610",
    "typecheck": "tsc --noEmit",
    "test": "tsc --noEmit"
  }
}
```

`web/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@moldura/common"],
};

export default config;
```

`web/.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:6600
```

Copie para `web/.env.local`.

```bash
pnpm --filter @moldura/web add @moldura/common@workspace:* next react react-dom
pnpm --filter @moldura/web add -D typescript @types/node @types/react @types/react-dom
```

`web/scripts/sync-frames.mjs`:

```js
import { cp, mkdir } from "node:fs/promises";

await mkdir("public/frames", { recursive: true });
await cp("../api/assets/frames", "public/frames", { recursive: true });
console.log("molduras copiadas para public/frames");
```

- [ ] **Step 2: Layout, estilos e home**

`web/src/app/globals.css`:

```css
:root { --blue:#1459d9; --ink:#0f172a; --muted:#475569; --bg:#f6f8fc; --line:#e2e8f0; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
a { color:inherit; }
.wrap { max-width:1080px; margin:0 auto; padding:0 20px; }
header.top { background:#fff; border-bottom:1px solid var(--line); }
header.top .wrap { display:flex; align-items:center; justify-content:space-between; height:60px; }
.logo { font-weight:800; font-size:20px; text-decoration:none; }
.btn { display:inline-block; border:0; border-radius:8px; padding:12px 22px; font:600 16px system-ui,sans-serif; background:var(--blue); color:#fff; cursor:pointer; text-decoration:none; }
.btn.alt { background:#fff; color:var(--ink); border:1px solid var(--line); }
.btn:disabled { opacity:.4; cursor:not-allowed; }
.hero { padding:48px 0 16px; }
.hero h1 { font-size:clamp(30px,5vw,48px); line-height:1.1; margin:0 0 14px; }
.hero p { color:var(--muted); font-size:18px; max-width:520px; margin:0 0 24px; }
.row { display:flex; gap:12px; flex-wrap:wrap; }
h2 { font-size:24px; margin:40px 0 16px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; }
.card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; text-align:center; text-decoration:none; display:block; }
.card:hover { border-color:var(--blue); }
.art { position:relative; aspect-ratio:1; border-radius:50%; overflow:hidden; background:#cfd8e6; }
.art svg, .art img { position:absolute; inset:0; width:100%; height:100%; }
.card b { display:block; margin-top:6px; }
.card small { color:var(--muted); }
.steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; }
.step { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px; }
.step i { display:inline-grid; place-items:center; width:28px; height:28px; border-radius:50%; background:#dbe7ff; color:var(--blue); font-style:normal; font-weight:700; margin-right:8px; }
.panel { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; background:#fff; border:1px solid var(--line); border-radius:16px; padding:24px; margin:24px 0; }
@media (max-width:760px) { .panel { grid-template-columns:1fr; } }
.preview { width:100%; max-width:440px; aspect-ratio:1; display:block; margin:0 auto; touch-action:none; cursor:grab; }
label { display:block; font-weight:600; margin:16px 0 6px; }
select, input[type=file], input[type=range] { width:100%; }
.hint { color:var(--muted); font-size:14px; margin-top:8px; }
.error { color:#b91c1c; font-weight:600; margin-top:12px; }
.qr { width:220px; height:220px; display:block; margin:0 auto; image-rendering:pixelated; }
.code { word-break:break-all; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px; font:13px ui-monospace,monospace; }
footer { color:var(--muted); font-size:13px; text-align:center; padding:32px 20px; }
```

`web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moldura Eleitoral",
  description: "Coloque na sua foto a moldura do político que você gosta.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="top">
          <div className="wrap">
            <Link className="logo" href="/">Moldura Eleitoral</Link>
            <Link className="btn" href="/criar">Criar agora</Link>
          </div>
        </header>
        {children}
        <footer>Site independente de apoio de eleitores. Não é material oficial de nenhuma campanha.</footer>
      </body>
    </html>
  );
}
```

`web/src/app/page.tsx`:

```tsx
import Link from "next/link";
import { CANDIDATES, PRICE_CENTS } from "@moldura/common";

const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function HomePage() {
  return (
    <main className="wrap">
      <section className="hero">
        <h1>Coloque na sua foto a moldura do político que você gosta</h1>
        <p>Mostre seu apoio nas redes sociais com uma moldura das eleições 2026. Veja a prévia de graça; para baixar a foto pronta, {price}.</p>
        <div className="row">
          <Link className="btn" href="/criar">Criar agora →</Link>
          <a className="btn alt" href="#exemplos">Ver exemplos</a>
        </div>
      </section>

      <section id="exemplos">
        <h2>Exemplos de molduras</h2>
        <div className="grid">
          {CANDIDATES.map((candidate) => (
            <Link key={candidate.id} className="card" href={`/criar?c=${candidate.id}`}>
              <div className="art">
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="42" r="17" fill="#9fb0c8" />
                  <ellipse cx="50" cy="92" rx="30" ry="28" fill="#9fb0c8" />
                </svg>
                <img src={`/frames/${candidate.id}.png`} alt={`Moldura de ${candidate.name}`} />
              </div>
              <b>{candidate.name}</b>
              <small>Número {candidate.number}</small>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>Como funciona</h2>
        <div className="steps">
          <div className="step"><i>1</i><b>Envie sua foto</b><p>Escolha uma foto do celular ou computador.</p></div>
          <div className="step"><i>2</i><b>Escolha a moldura</b><p>Selecione o candidato e ajuste a imagem.</p></div>
          <div className="step"><i>3</i><b>Pague e baixe</b><p>Pague o Pix de {price}, baixe a foto e publique nas redes.</p></div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Verificar tipos e build**

Run: `pnpm --filter @moldura/web typecheck` e `pnpm --filter @moldura/web build`
Expected: sem erros. (O Next pode ajustar `tsconfig.json` na primeira execução; aceite o ajuste.)

- [ ] **Step 4: Conferir no navegador**

Run: `pnpm --filter @moldura/web dev` e abra `http://localhost:6610`.
Expected: hero, 6 cards com silhueta cinza e a moldura por cima, "Como funciona". Clicar num card abre `/criar?c=<id>` (404 até a próxima tarefa).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): esqueleto Next.js e home com exemplos de molduras"
```

---

### Task 11: `web` — criar moldura, prévia e pagamento

**Files:**
- Create: `web/src/lib/api.ts`, `web/src/lib/preview.ts`, `web/src/app/criar/page.tsx`, `web/src/app/criar/FrameEditor.tsx`, `web/src/app/pedido/[id]/page.tsx`, `web/src/app/pedido/[id]/OrderStatus.tsx`

**Interfaces:**
- Consumes: `createOrder`/`getOrder` falam com a `api` (`POST /orders` multipart: campos `candidateId`, `framing`, e **por último** o arquivo `photo`; `GET /orders/:id`); `placePhoto`, `innerRadius`, `FRAME_SIZE`, `OrderSchema`.
- Produces: `createOrder(input: { candidateId: string; framing: Framing; photo: File }): Promise<Order>`; `getOrder(id: string): Promise<Order>`; `drawPreview(canvas, image, frame, framing): void`; rotas `/criar` e `/pedido/[id]`.

- [ ] **Step 1: Cliente da api e desenho da prévia**

`web/src/lib/api.ts`:

```ts
import { OrderSchema } from "@moldura/common";
import type { Framing, Order } from "@moldura/common";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6600";

async function readOrder(response: Response): Promise<Order> {
  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : "Algo deu errado. Tente de novo.";

    throw new Error(message);
  }

  return OrderSchema.parse(json);
}

export async function createOrder(input: { candidateId: string; framing: Framing; photo: File }): Promise<Order> {
  const form = new FormData();

  form.append("candidateId", input.candidateId);
  form.append("framing", JSON.stringify(input.framing));
  form.append("photo", input.photo);

  const response = await fetch(`${API_URL}/orders`, { method: "POST", body: form });

  return readOrder(response);
}

export async function getOrder(id: string): Promise<Order> {
  const response = await fetch(`${API_URL}/orders/${id}`, { cache: "no-store" });

  return readOrder(response);
}
```

`web/src/lib/preview.ts`:

```ts
import { FRAME_SIZE, innerRadius, placePhoto } from "@moldura/common";
import type { Framing } from "@moldura/common";

function drawWatermark(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = "800 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.fillStyle = "rgba(255,255,255,0.55)";

  for (let y = -size; y <= size; y += 220) {
    ctx.strokeText("PRÉVIA • MOLDURA ELEITORAL", 0, y);
    ctx.fillText("PRÉVIA • MOLDURA ELEITORAL", 0, y);
  }

  ctx.restore();
}

export function drawPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  frame: HTMLImageElement | null,
  framing: Framing,
): void {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const size = FRAME_SIZE;

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, innerRadius(size), 0, Math.PI * 2);
  ctx.clip();

  if (image) {
    const placement = placePhoto({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      zoom: framing.zoom,
      offsetX: framing.offsetX,
      offsetY: framing.offsetY,
      size,
    });

    ctx.drawImage(image, placement.left, placement.top, placement.width, placement.height);
  } else {
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, size, size);
  }

  ctx.restore();

  if (frame) {
    ctx.drawImage(frame, 0, 0, size, size);
  }

  drawWatermark(ctx, size);
}
```

- [ ] **Step 2: Página de criar**

`web/src/app/criar/page.tsx`:

```tsx
import { CANDIDATES } from "@moldura/common";
import { FrameEditor } from "@/app/criar/FrameEditor";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const initial = CANDIDATES.find((candidate) => candidate.id === c) ?? CANDIDATES[0];

  return (
    <main className="wrap">
      <h2>Criar minha moldura</h2>
      <FrameEditor initialCandidateId={initial.id} />
    </main>
  );
}
```

`web/src/app/criar/FrameEditor.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CANDIDATES, FRAME_SIZE, MAX_ZOOM, PHOTO_MAX_BYTES, PRICE_CENTS } from "@moldura/common";
import type { Framing } from "@moldura/common";
import { createOrder } from "@/lib/api";
import { drawPreview } from "@/lib/preview";

const price = (PRICE_CENTS / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Drag = { x: number; y: number; offsetX: number; offsetY: number };

export function FrameEditor({ initialCandidateId }: { initialCandidateId: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const [candidateId, setCandidateId] = useState(initialCandidateId);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<HTMLImageElement | null>(null);
  const [framing, setFraming] = useState<Framing>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = new Image();

    element.onload = () => setFrame(element);
    element.src = `/frames/${candidateId}.png`;
  }, [candidateId]);

  useEffect(() => {
    if (!file) {
      setImage(null);

      return;
    }

    const url = URL.createObjectURL(file);
    const element = new Image();

    element.onload = () => setImage(element);
    element.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (canvasRef.current) {
      drawPreview(canvasRef.current, image, frame, framing);
    }
  }, [image, frame, framing]);

  function pickFile(selected: File | null) {
    setError("");

    if (selected && selected.size > PHOTO_MAX_BYTES) {
      setError("A foto passa de 8 MB. Escolha outra.");

      return;
    }

    setFile(selected);
    setFraming({ zoom: 1, offsetX: 0, offsetY: 0 });
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: framing.offsetX, offsetY: framing.offsetY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const width = event.currentTarget.getBoundingClientRect().width;
    const clamp = (value: number) => Math.min(1, Math.max(-1, value));

    setFraming((current) => ({
      ...current,
      offsetX: clamp(drag.offsetX + (event.clientX - drag.x) / width),
      offsetY: clamp(drag.offsetY + (event.clientY - drag.y) / width),
    }));
  }

  async function submit() {
    if (!file) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const order = await createOrder({ candidateId, framing, photo: file });

      router.push(`/pedido/${order.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Algo deu errado. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <canvas
        ref={canvasRef}
        className="preview"
        width={FRAME_SIZE}
        height={FRAME_SIZE}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      />

      <div>
        <label htmlFor="photo">1. Sua foto</label>
        <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />

        <label htmlFor="candidate">2. Moldura</label>
        <select id="candidate" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
          {CANDIDATES.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} • {candidate.number}
            </option>
          ))}
        </select>

        <label htmlFor="zoom">3. Ajuste (arraste a foto e use o zoom)</label>
        <input
          id="zoom"
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={framing.zoom}
          onChange={(event) => setFraming((current) => ({ ...current, zoom: Number(event.target.value) }))}
        />

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn" disabled={!file || busy} onClick={submit}>
            {busy ? "Gerando Pix..." : `Baixar foto pronta • ${price}`}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
        <p className="hint">A prévia tem marca d&apos;água. Depois do pagamento do Pix, você baixa a foto sem ela.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Página do pedido (Pix e download)**

`web/src/app/pedido/[id]/page.tsx`:

```tsx
import { OrderStatus } from "@/app/pedido/[id]/OrderStatus";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="wrap">
      <h2>Seu pedido</h2>
      <OrderStatus id={id} />
    </main>
  );
}
```

`web/src/app/pedido/[id]/OrderStatus.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@moldura/common";
import { getOrder } from "@/lib/api";

const POLL_MS = 3000;

function qrSource(brCodeBase64: string): string {
  return brCodeBase64.startsWith("data:") ? brCodeBase64 : `data:image/png;base64,${brCodeBase64}`;
}

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const status = order?.status;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const next = await getOrder(id);

        if (active) {
          setOrder(next);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Algo deu errado.");
        }
      }
    }

    void load();

    if (status === "paid" || status === "expired") {
      return () => {
        active = false;
      };
    }

    const timer = setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, status]);

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  if (error && !order) {
    return <p className="error">{error}</p>;
  }

  if (!order) {
    return <p>Carregando...</p>;
  }

  if (order.status === "paid" && order.downloadUrl) {
    return (
      <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
        <b>Pagamento confirmado! Sua foto está pronta.</b>
        <div className="row">
          <a className="btn" href={order.downloadUrl}>Baixar foto</a>
          <Link className="btn alt" href="/criar">Criar outra</Link>
        </div>
        <p className="hint">O link vale por poucos minutos; recarregue esta página para gerar outro. A imagem fica disponível por 7 dias.</p>
      </section>
    );
  }

  if (order.status === "paid" || order.status === "paid_failed") {
    return (
      <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
        <b>Pagamento confirmado.</b>
        <p>{order.status === "paid_failed" ? "Estamos finalizando sua foto. Esta página atualiza sozinha." : "A imagem desse pedido não está mais disponível."}</p>
      </section>
    );
  }

  if (order.status === "expired") {
    return (
      <section className="panel" style={{ gridTemplateColumns: "1fr" }}>
        <b>Esse Pix expirou.</b>
        <div className="row"><Link className="btn" href="/criar">Criar de novo</Link></div>
      </section>
    );
  }

  const pix = order.pix;

  return (
    <section className="panel">
      {pix ? <img className="qr" src={qrSource(pix.brCodeBase64)} alt="QR Code do Pix" /> : null}
      <div>
        <b>Pague o Pix para liberar sua foto</b>
        <p className="hint">Abra o app do seu banco, escolha Pix e leia o QR Code ou use o código copia e cola. Esta página confirma sozinha.</p>
        {pix ? (
          <>
            <div className="code">{pix.brCode}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn alt" onClick={() => copyCode(pix.brCode)}>{copied ? "Copiado!" : "Copiar código"}</button>
            </div>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verificar tipos e build**

Run: `pnpm --filter @moldura/web typecheck` e `pnpm --filter @moldura/web build`
Expected: sem erros.

- [ ] **Step 5: Conferir no navegador (sem pagar)**

Com infra, `api` e `web` rodando (`docker compose up -d`, `pnpm dev:api`, `pnpm dev:web`), abra `http://localhost:6610/criar?c=zema`.
Expected: (1) o canvas mostra o círculo cinza com a moldura do Zema e a marca d'água; (2) escolher uma foto a coloca dentro do círculo; arrastar e o zoom funcionam; (3) trocar o candidato muda a moldura; (4) com uma chave válida da AbacatePay em `api/.env`, o botão leva a `/pedido/<id>` e mostra o QR Code e o copia e cola; sem chave válida, mostra o erro "Não foi possível gerar o Pix agora..." (comportamento correto).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): criação da moldura com prévia e tela de pagamento do Pix"
```

---

### Task 12: README e verificação ponta a ponta

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Escrever o README**

Substitua `README.md` por:

````markdown
# Moldura Eleitoral

Monorepo pnpm: `common` (schemas e candidatos), `api` (Fastify + Postgres + MinIO + sharp), `web` (Next.js).
O cliente vê a prévia grátis (com marca d'água), paga R$ 3,99 por Pix (AbacatePay) e baixa o PNG sem marca d'água, montado no servidor depois do pagamento.

## Rodar local

1. `docker compose up -d` (Docker Desktop aberto): Postgres :5433, MinIO :9200 (console :9201).
2. `pnpm install`
3. `api/.env`: copie de `api/.env.example` e preencha `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET` (24+ caracteres aleatórios). `web/.env.local`: copie de `web/.env.example`.
4. `pnpm --filter @moldura/api db:setup`
5. `pnpm dev:api` e `pnpm dev:web` → http://localhost:6610

## Testes

`pnpm test` (precisa do Postgres do passo 1). Cria o banco `moldura_test` sozinho.

## Molduras

Ficam em `api/assets/frames/<id>.png` (1080×1080, anel opaco, centro e cantos transparentes, sem rostos). `pnpm --filter @moldura/api frames:placeholder` regenera os placeholders; as molduras finais são geradas pelo Codex (prompt na Task 4 do plano) e validadas por `pnpm --filter @moldura/api test`.

## AbacatePay

- Webhook: configure no painel da AbacatePay a URL `https://<api>/webhooks/abacatepay?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>`.
- A `api` **reconsulta** o status do Pix antes de liberar qualquer pedido; o webhook sozinho não libera nada.
- Dev/sandbox é definido pela chave de API usada.

## Pendências

- Hospedagem e domínio (o link de download usa o endereço do MinIO; em produção ele precisa ser alcançável pelo navegador).
- Validar com advogado eleitoral a cobrança por material de apoio e o uso dos nomes dos candidatos antes de lançar.
````

- [ ] **Step 2: Rodar tudo**

Run: `pnpm test` e `pnpm typecheck`
Expected: todos os testes de `common` e `api` PASS; `web` e `api` sem erros de tipo.

- [ ] **Step 3: Verificação manual ponta a ponta com a AbacatePay em modo de teste**

Com uma chave de **desenvolvimento** da AbacatePay em `api/.env` e o webhook apontando para um túnel público da `api` (ou sem webhook, confiando no polling):
1. Em `/criar`, envie uma foto, escolha uma moldura, clique em "Baixar foto pronta".
2. Em `/pedido/<id>`, confira o QR Code e o copia e cola.
3. Pague o Pix pelo método de simulação do ambiente de desenvolvimento da AbacatePay (veja na documentação como simular o pagamento em dev).
4. Em até alguns segundos (polling de 3 s) a tela vira "Pagamento confirmado" com o botão **Baixar foto**.
5. Baixe o PNG e confira: 1080×1080, foto dentro do círculo, moldura por cima, **sem** marca d'água.
6. No console do MinIO (http://localhost:9201), confira que `photos/<id>.jpg` foi apagada e existe `results/<id>.png`.

Expected: todos os passos funcionam. Anote no README qualquer diferença entre a AbacatePay real e o que o plano assumiu.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README com execução local, molduras e AbacatePay"
```
