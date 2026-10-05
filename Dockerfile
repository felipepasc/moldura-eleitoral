# API (Fastify). Build context: raiz do repositório. Debian slim (o sharp precisa de glibc).
FROM node:24-bookworm-slim

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY common/package.json common/package.json
COPY api/package.json api/package.json

RUN pnpm install --frozen-lockfile --prod --filter @moldura/api --filter @moldura/common

COPY tsconfig.base.json ./
COPY common common
COPY api api

RUN chown -R node:node /app
USER node

EXPOSE 6600

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 6600) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Migra e sobe (o equivalente a `pnpm --filter @moldura/api db:setup && pnpm --filter @moldura/api start`,
# sem passar pelo corepack em tempo de execução, que tentaria baixar o pnpm).
WORKDIR /app/api
CMD ["sh", "-c", "./node_modules/.bin/tsx --env-file-if-exists=.env src/scripts/setup-db.ts && exec ./node_modules/.bin/tsx --env-file-if-exists=.env src/main.ts"]
