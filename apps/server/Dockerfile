# Organo Healers API (Express + Prisma + Puppeteer) for Render.
# Build context is the repo root (monorepo): docker build -f apps/server/Dockerfile .
FROM node:22-bookworm-slim

# System Chromium for PDF rendering (Puppeteer's own download is skipped), fonts for
# the rupee sign and Indian scripts, and OpenSSL for Prisma's query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Install only the server + shared workspaces (the web app isn't needed here).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@organo/server --workspace=@organo/shared --include-workspace-root --include=dev --no-audit --no-fund

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run db:generate -w @organo/server && npm run build -w @organo/server

ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 4000
# Apply pending migrations (uses DIRECT_URL), then start. Render provides PORT.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
