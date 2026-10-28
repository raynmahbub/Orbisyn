# syntax=docker/dockerfile:1

# Orbisyn ships as one small Node process: the gateway serves the API and the
# built web client from the same origin, so there is no reverse proxy, no CORS
# allowlist and nothing to keep in sync between two images.

FROM node:22-alpine AS builder

WORKDIR /app

# Manifests first: dependency layers are only rebuilt when a manifest or the
# lockfile changes, not on every source edit.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/osp/package.json packages/osp/
COPY packages/providers/package.json packages/providers/
COPY packages/sdk/package.json packages/sdk/
COPY services/gateway/package.json services/gateway/
COPY apps/web/package.json apps/web/
COPY tooling/tsconfig/package.json tooling/tsconfig/
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    GATEWAY_HOST=0.0.0.0 \
    GATEWAY_PORT=8787 \
    ORBISYN_STORE_FILE=/data/orbisyn.json \
    ORBISYN_SYNC_VAULT_FILE=/data/sync-vaults.json

WORKDIR /app

# Runtime dependencies only. The gateway bundle keeps third-party packages
# external, so this install is what the image actually runs on.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/osp/package.json packages/osp/
COPY packages/providers/package.json packages/providers/
COPY packages/sdk/package.json packages/sdk/
COPY services/gateway/package.json services/gateway/
COPY apps/web/package.json apps/web/
COPY tooling/tsconfig/package.json tooling/tsconfig/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/services/gateway/dist services/gateway/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# The named compose volume is mounted here. The non-root runtime user needs
# ownership so the file-backed store can atomically persist its snapshot.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "services/gateway/dist/server.js"]
