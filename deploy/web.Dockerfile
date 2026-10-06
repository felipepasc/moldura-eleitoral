# Web (Next.js). Build context: raiz do repositório.
# Os NEXT_PUBLIC_* entram no código do navegador e no CSP: precisam existir no BUILD.
FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY common/package.json common/package.json
COPY web/package.json web/package.json
COPY api/package.json api/package.json

RUN pnpm install --frozen-lockfile --filter @moldura/web --filter @moldura/common

COPY tsconfig.base.json ./
COPY common common
COPY web web
# O prebuild (sync-frames) lê as molduras de api/assets/frames.
COPY api/assets/frames api/assets/frames

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_IMAGES_ORIGIN
ARG NEXT_PUBLIC_OPERATOR_NAME
ARG NEXT_PUBLIC_OPERATOR_DOC
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_IMAGES_ORIGIN=$NEXT_PUBLIC_IMAGES_ORIGIN \
    NEXT_PUBLIC_OPERATOR_NAME=$NEXT_PUBLIC_OPERATOR_NAME \
    NEXT_PUBLIC_OPERATOR_DOC=$NEXT_PUBLIC_OPERATOR_DOC \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @moldura/web build

FROM build AS runtime

ENV NODE_ENV=production
RUN chown -R node:node /app
USER node

EXPOSE 6610

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:6610/').then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

# Sem pnpm/corepack em tempo de execução (não há rede para baixá-los): chama o next direto.
WORKDIR /app/web
CMD ["./node_modules/.bin/next", "start", "-p", "6610"]
