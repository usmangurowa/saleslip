# syntax=docker/dockerfile:1.7
#
# @turbo/server: Hono API image (esbuild bundle, migrations applied on boot).
#
# Build from the repo root (the context must be the monorepo, not apps/server):
#   docker build -f apps/server/Dockerfile -t turbo-server .
#
# Run:
#   docker run --rm -p 3001:3001 -e POSTGRES_URL=... -e AUTH_SECRET=... turbo-server
#
# Boot sequence mirrors root `pnpm start:server` (migrate, then start), but
# from a bundle: dist/migrate.mjs applies packages/db/drizzle with
# drizzle-orm's migrator (same `drizzle.__drizzle_migrations` table that
# drizzle-kit migrate uses), then dist/index.mjs starts the server. The runner
# ships no node_modules, pnpm, tsx, TypeScript, or drizzle-kit.
#
# Coolify: build pack "dockerfile", dockerfile location "/apps/server/Dockerfile",
# base directory "/", port 3001, health check GET /health, and no custom
# install/build/start command (the CMD is baked in).
#
# WiFi voucher deployments also set WG_GATEWAY_HOST (the wg-easy container)
# and `cap_add: [NET_ADMIN]`: the entrypoint routes 10.8.0.0/24 through it so
# the RouterOS API on the hotspot is reachable. See deploy/coolify-compose.snippet.yaml.
#
# Keep NODE_VERSION in sync with .nvmrc and PNPM_VERSION with
# package.json#packageManager.

ARG NODE_VERSION=22.21.0
ARG PNPM_VERSION=10.34.5

# ---------------------------------------------------------------------------
# base: Node + pnpm. pnpm is installed with npm rather than corepack so it works
# for any user without a per-user corepack cache.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN apk add --no-cache libc6-compat \
  && npm install -g pnpm@${PNPM_VERSION} \
  && npm cache clean --force
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=1 \
  DO_NOT_TRACK=1 \
  TURBO_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------
# manifests: every workspace package.json plus the lockfile and nothing else,
# so the install layer below is cached until a manifest or the lockfile changes.
# apps/mobile/package.json is kept (see .dockerignore) so --frozen-lockfile
# still sees the full workspace graph, but the --filter below never installs it.
# ---------------------------------------------------------------------------
FROM base AS manifests
COPY . /src
RUN set -eu; \
  mkdir -p /manifests; \
  cd /src; \
  find . -name package.json -not -path '*/node_modules/*' \
    -exec sh -c 'mkdir -p "/manifests/$(dirname "$1")" && cp "$1" "/manifests/$1"' _ {} \; ; \
  cp pnpm-lock.yaml pnpm-workspace.yaml /manifests/; \
  [ -f .npmrc ] && cp .npmrc /manifests/ || true

# ---------------------------------------------------------------------------
# deps: install @turbo/server and its workspace dependencies. Scripts are
# skipped (the root postinstall runs sherif over the network; esbuild ships
# platform binaries as optional deps). The one exception is @infisical/cli:
# its preinstall downloads the Infisical CLI binary that the runner's secrets
# wrapper needs, so it is rebuilt explicitly (and stripped: the unstripped Go
# binary is 120 MB, stripped ~85 MB).
# ---------------------------------------------------------------------------
FROM base AS deps
# INSTALL_INFISICAL_CLI=0 leaves the Infisical CLI binary (~90 MB) out of the
# image. scripts/infisical-run.sh then runs the command on platform env vars
# alone, exactly as it does today when no INFISICAL_* credentials are set; with
# credentials but no binary it fails fast at boot.
ARG INSTALL_INFISICAL_CLI=1
COPY --from=manifests /manifests /app
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile --ignore-scripts --filter "@turbo/server..." \
  && mkdir -p /infisical \
  && if [ "$INSTALL_INFISICAL_CLI" = "1" ]; then \
    pnpm rebuild @infisical/cli \
    && test -x node_modules/@infisical/cli/bin/infisical \
    && apk add --no-cache binutils \
    && strip -o /infisical/infisical node_modules/@infisical/cli/bin/infisical; \
  fi

# ---------------------------------------------------------------------------
# build: esbuild bundles src/index.ts and src/migrate.ts (with every workspace
# package and npm dependency inlined) into dist/*.mjs. See apps/server/build.mjs.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . /app
ENV SKIP_ENV_VALIDATION=1
RUN pnpm -F @turbo/server bundle

# .infisical.json (written by `pnpm exec infisical init`) is optional for the
# template: forks can set INFISICAL_PROJECT_ID instead. Guarantee the file
# exists so the runner's COPY never fails.
RUN [ -f .infisical.json ] || echo '{}' > .infisical.json

# ---------------------------------------------------------------------------
# typecheck: tsc --noEmit over the server and the workspace sources it
# imports. esbuild strips types without checking them, so this stage is what
# fails the deploy on a type error. BuildKit runs it in parallel with `build`;
# the runner copies its empty marker file, so TypeScript never ships.
# ---------------------------------------------------------------------------
FROM deps AS typecheck
COPY . /app
RUN pnpm -F @turbo/server typecheck && touch /typecheck.ok

# ---------------------------------------------------------------------------
# runner: the bundle, the SQL migrations, the secrets wrapper and the
# Infisical CLI binary. No node_modules.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
COPY --from=typecheck /typecheck.ok /tmp/typecheck.ok
# iproute2 adds the WireGuard route at boot; su-exec drops root afterwards.
# tini is PID 1 so SIGTERM reaches node (node as PID 1 ignores it).
RUN apk add --no-cache iproute2 su-exec tini
ENV NODE_ENV=production \
  PORT=3001
WORKDIR /app

COPY --from=build --chown=node:node /app/apps/server/dist ./dist
COPY --from=build --chown=node:node /app/packages/db/drizzle ./drizzle

# Secrets wrapper (the same script `pnpm with-secrets` runs locally) and the
# Infisical CLI it falls back to on PATH. With INFISICAL_CLIENT_ID +
# INFISICAL_CLIENT_SECRET (+ INFISICAL_PROJECT_ID / INFISICAL_ENV) set, the
# container pulls its secrets from Infisical at boot; without them it runs on
# platform-injected env vars alone.
COPY --from=build --chown=node:node /app/scripts/infisical-run.sh ./scripts/infisical-run.sh
COPY --from=build --chown=node:node /app/.infisical.json ./.infisical.json
COPY --from=build /infisical/ /usr/local/bin/
COPY --from=build /app/apps/server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The entrypoint starts as root only to add the route, then `su-exec node`.
# Coolify's own health check (GET /health on 3001) stays in charge; a
# Dockerfile HEALTHCHECK would replace it.
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--", "sh", "/usr/local/bin/docker-entrypoint.sh"]

# Equivalent to `pnpm with-secrets pnpm start:server`: migrate, then exec the
# server so node receives SIGTERM directly. There is no .env in the image: the
# wrapper injects Infisical secrets (or passes platform env vars through).
CMD ["sh", "scripts/infisical-run.sh", "--", "sh", "-c", \
  "node dist/migrate.mjs && exec node --enable-source-maps dist/index.mjs"]
