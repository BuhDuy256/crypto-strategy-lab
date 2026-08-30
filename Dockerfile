# syntax=docker/dockerfile:1
#
# Full-system integration and demo image for Crypto Strategy Lab.
#
# This file builds two runtime images from one pnpm workspace:
#   - "backend": one Node image that serves four process roles (migrate,
#     api, runner, news-worker). The Compose service picks the role through its command.
#   - "web": the built React SPA served by Nginx, which also reverse-proxies
#     the "/api" prefix to the api process (the same prefix the dev proxy uses).
#
# Scope note: this is a demo and integration image, not a hardened production
# build. Image hardening, multi-arch, and orchestration are out of scope for
# DEMO-01 (see implementation-plan/06-ui-and-demo-integration.md).

# --- Base: Node with pnpm available through corepack -------------------------
# Node 22, not 20: the backtest runner spawns its CPU work in a Worker Thread
# that runs TypeScript through the tsx ESM loader. Node 20 does not apply an
# `--import`-registered loader to a worker's own entry module, so the worker
# fails with "Unknown file extension .ts"; Node 22 does. The host runtime this
# code is proven on is Node >=22, and package.json engines already allows it.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- deps: install the whole workspace from the frozen lockfile --------------
# Only the manifests are copied first so this layer caches when source changes
# but dependencies do not. devDependencies are installed on purpose: the
# backend runs TypeScript through "tsx" and the web builds with "vite", both
# of which are devDependencies. NODE_ENV is left unset here so pnpm keeps them.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/web/package.json ./apps/web/
COPY packages/api-contracts/package.json ./packages/api-contracts/
RUN pnpm install --frozen-lockfile

# --- backend: source over the installed dependencies -------------------------
# The host node_modules is excluded by .dockerignore, so COPY keeps the
# Linux dependencies installed in the deps layer and overlays the source.
FROM deps AS backend
ENV NODE_ENV=production
COPY . .
# Default role. Compose overrides this per service (migrate / api / runner).
CMD ["pnpm", "run", "start:api"]

# --- web-build: produce the static SPA bundle --------------------------------
FROM deps AS web-build
COPY . .
RUN pnpm --filter @crypto-strategy-lab/web run build

# --- web: serve the SPA and proxy /api to the api process --------------------
FROM nginx:alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
