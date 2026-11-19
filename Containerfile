# SPDX-FileCopyrightText: Sophie de Klerk
# SPDX-License-Identifier: Apache-2.0
#
# The production image (ADR 0008, Q-MAINT-2): the Nitro server that
# `pnpm build` writes to .output/, on Node.js as the unprivileged `node` user.
# Next to it sit the production dependencies and the server sources the two
# operator commands run on plain Node.js (docs/deployment.md):
#
#   node src/server/db/migrate.ts                         # migrations
#   node src/server/admin/grant.ts grant <email> [--facilitator]
#
# Build it with `podman compose build` (compose.yaml), or by hand:
#   podman build --format docker -t localhost/cdm-plenum:latest .
# `--format docker` keeps the HEALTHCHECK; the OCI format has no field for it.

# The Node.js version of .node-version, pinned by the tag's multi-arch index.
FROM docker.io/library/node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS base
# npm runs in /tmp: next to package.json its devEngines field makes npm refuse.
WORKDIR /tmp
RUN npm install --global pnpm@12.21.0 && npm cache clean --force
ENV CI=true
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# ── build: every dependency, then the production build ──────────────────────
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── deps: the production dependencies only, for the operator commands ──────
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ── runtime ─────────────────────────────────────────────────────────────────
FROM docker.io/library/node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runtime

WORKDIR /app
# Root-owned, so the server cannot change its own code; compose.yaml also
# mounts the root filesystem read-only.
COPY --from=build /src/.output ./.output
COPY --from=deps /src/node_modules ./node_modules
COPY package.json ./
COPY src/server/env.ts ./src/server/env.ts
COPY src/server/db ./src/server/db
COPY src/server/admin ./src/server/admin

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000/tcp

USER node

# /api/health answers without touching the database (src/routes/api/health.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", ".output/server/index.mjs"]
