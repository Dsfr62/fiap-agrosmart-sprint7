# App web do AgroSmart (Next.js) em três etapas: dependências, build e execução.
# Node 22 (Debian slim) porque o better-sqlite3 é módulo nativo e precisa ser montado
# para o mesmo Node que roda o app. O Bun entra só para instalar pelo bun.lock.
# (A imagem da Sprint 6, em Bun Alpine, não montava: sem compilador para o better-sqlite3.
#  O pipeline da Sprint 7 achou isso na primeira execução.)
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=oven/bun:1.2.21 /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts \
  && npm rebuild better-sqlite3

FROM deps AS builder
COPY . .
# O cliente do banco abre o SQLite ao carregar; no build, um banco descartável.
RUN mkdir -p /tmp/build-data \
  && DB_PATH=/tmp/build-data/build.db ./node_modules/.bin/next build

FROM base AS runner
ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0
# Correções de segurança do Debian e, fora da imagem final, o npm, o npx e o corepack:
# o app só precisa do node para rodar, e o npm traz bibliotecas com vulnerabilidade (Trivy).
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && mkdir -p /data && chown node:node /data
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
