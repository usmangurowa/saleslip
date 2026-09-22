# Turbo Monorepo

A full-stack TypeScript monorepo with Next.js, Expo, and Hono RPC.

## Tech Stack

| Category         | Technology          | Version  |
| ---------------- | ------------------- | -------- |
| Runtime          | Node.js             | ^22.14.0 |
| Package Manager  | pnpm                | ^10.19.0 |
| Monorepo Tool    | Turborepo           | ^2.9.16  |
| Language         | TypeScript          | ^6.0.3   |
| Web Framework    | Next.js             | 16.2.7   |
| Mobile Framework | Expo SDK            | ~56.0.8  |
| React            | React               | 19.2.3   |
| React Native     | React Native        | ~0.85.3  |
| Styling          | Tailwind CSS        | ^4.3.0   |
| Mobile Styling   | Uniwind             | ~1.8.0   |
| API Framework    | Hono                | ^4.12.23 |
| API Validation   | @hono/zod-validator | ^0.8.0   |
| Database ORM     | Drizzle ORM         | ^0.45.2  |
| Database Driver  | postgres.js         | ^3.4.9   |
| Auth             | Better Auth         | 1.6.14   |
| Validation       | Zod                 | 4.4.3    |
| Query Client     | TanStack Query      | ^5.101.0 |
| UI Components    | shadcn/ui           | latest   |
| Testing          | Vitest              | 4.1.8    |

## Codebase Structure

```text
.github/
  └─ workflows/
        └─ CI with pnpm cache setup
.vscode/
  └─ Recommended extensions and settings for VSCode users
apps/
  ├─ mobile/                          # Expo mobile app
  │   ├─ Expo SDK 55 (~55.0.15)
  │   ├─ React Native 0.83.4 with React 19.2.0
  │   ├─ Navigation using Expo Router
  │   ├─ Tailwind CSS using Uniwind
  │   └─ Type-safe API calls using Hono RPC client
  └─ web/                             # Next.js web app
      ├─ Next.js 16.2.4
      ├─ React 19.2.0
      ├─ Tailwind CSS v4.1.16
      └─ Hono RPC API server & type-safe client
packages/
  ├─ api/                             # @turbo/api
  │   └─ Hono RPC routes with @hono/zod-validator
  ├─ auth/                            # @turbo/auth
  │   └─ Authentication using Better Auth
  ├─ db/                              # @turbo/db
  │   └─ Type-safe database using Drizzle ORM & Supabase
  ├─ paystack/                        # @turbo/paystack
  │   └─ Paystack initialize/verify client + webhook signature check
  ├─ routeros/                        # @turbo/routeros
  │   └─ Typed MikroTik RouterOS API wrapper (hotspot users, kick, resource)
  ├─ ui/                              # @turbo/ui
  │   └─ Shared UI components using shadcn/ui
  └─ validators/                      # @turbo/validators
      └─ Shared Zod validation schemas
tooling/
  ├─ eslint/                          # @turbo/eslint-config
  │   └─ Shared ESLint presets
  ├─ prettier/                        # @turbo/prettier-config
  │   └─ Shared Prettier configuration
  ├─ tailwind/                        # @turbo/tailwind-config
  │   └─ Shared Tailwind theme and configuration
  ├─ typescript/                      # @turbo/tsconfig
  │   └─ Shared TypeScript configurations
  └─ vitest/                          # @turbo/vitest-config
      └─ Shared Vitest test configuration
```

## Quick Start

### 1. Setup Dependencies

```bash
# Install dependencies
pnpm i

# Configure environment variables
cp .env.example .env
```

**Optional — Infisical secrets manager.** Instead of maintaining a local `.env`, you can inject secrets at runtime from [Infisical](https://infisical.com). The CLI ships as a dev dependency; connect once, then use the `:infisical` script variants:

```bash
# One-time: authenticate and link the repo to your Infisical project
pnpm exec infisical login
pnpm exec infisical init   # writes .infisical.json — commit it (contains no secrets)

# Run dev with secrets injected (auto-reloads when secrets change)
pnpm dev:infisical

# Wrap any other command
pnpm with-secrets pnpm db:migrate
```

Both sources compose: variables injected by Infisical take precedence, and anything missing still falls back to `.env` via each app's `with-env` script.

`pnpm with-secrets` and `pnpm dev:infisical` run through `scripts/infisical-run.sh`, the same wrapper the Docker images boot with. It picks credentials in this order: `INFISICAL_CLIENT_ID` + `INFISICAL_CLIENT_SECRET` ([machine identity](https://infisical.com/docs/documentation/platform/identities/machine-identities), what production uses), a pre-issued `INFISICAL_TOKEN`, then your local `infisical login` session; in CI or with nothing configured it runs the command on the existing env vars and says so. The project comes from `INFISICAL_PROJECT_ID` or `.infisical.json`, the environment slug from `INFISICAL_ENV` (default `dev`).

### 2. Database Setup (Drizzle ORM)

The database schema is defined in `packages/db/src/schema.ts`, and durable SQL migrations are generated into `packages/db/drizzle/`.

Use this workflow when you add tables or change columns:

```bash
# 1. Generate a reviewed SQL migration from schema changes
pnpm db:generate -- --name add_projects_table

# 2. Apply pending migrations to your database
pnpm db:migrate

# 3. Inspect data locally
pnpm db:studio
```

> [!TIP]
> Use `pnpm db:generate` and `pnpm db:migrate` for all shared, staging, and production schema changes. `pnpm db:push:local` is only for disposable local databases.

Migration safety rules:

- Treat generated SQL as a reviewed artifact and commit it with the schema change.
- Prefer additive changes first: add nullable columns or columns with defaults, backfill, then enforce constraints in a later migration.
- Avoid rename-in-place for important tables or columns. Prefer add, backfill, switch reads/writes, then drop later.
- Run `pnpm db:migrate` in deployment instead of pushing schema state directly.

### 3. Generate Better Auth Schema

Better Auth requires a schema file to be generated from its configuration. This creates the authentication tables schema:

```bash
# Generate the Better Auth schema
pnpm auth:generate
```

This generates `packages/db/src/auth-schema.ts` from the config at `packages/auth/script/auth-cli.ts`.

After generating, create and apply a real migration for the new auth tables:

```bash
pnpm db:generate -- --name auth_schema_update
pnpm db:migrate
```

### 4. Start Development

```bash
# Start web + server (mobile is interactive and runs in its own terminal)
pnpm dev

# Start web only
pnpm dev:web

# Start mobile only
pnpm dev:mobile
```

## Mobile App Setup (Expo)

### Initialize Expo Project & Get EAS Project ID

To use EAS Build and EAS Update, you need to initialize your project with Expo:

```bash
# Install EAS CLI globally (if not installed)
pnpm add -g eas-cli

# Login to your Expo account
eas login

# Navigate to mobile app
cd apps/mobile

# Initialize EAS for your project (this creates/links to an EAS project)
eas init

# Or configure builds (this also creates an EAS project if needed)
eas build:configure
```

After running `eas init` or `eas build:configure`, you'll receive an **EAS Project ID**. Update these files with your project ID:

1. **`apps/mobile/app.config.ts`** - Update the `extra.eas.projectId` and `updates.url`:

   ```typescript
   updates: {
     url: "https://u.expo.dev/YOUR_PROJECT_ID",
   },
   extra: {
     eas: {
       projectId: "YOUR_PROJECT_ID",
     },
   },
   ```

2. **`apps/mobile/eas.json`** - Already configured with build profiles

### Running on Simulators/Emulators

**iOS Simulator:**

```bash
cd apps/mobile
pnpm dev:ios
# or
expo start --ios
```

**Android Emulator:**

```bash
cd apps/mobile
pnpm dev:android
# or
expo start --android
```

### Building the App

The mobile app includes pre-configured build scripts for all environments:

| Script                         | Description                                 |
| ------------------------------ | ------------------------------------------- |
| `pnpm build:dev:android`       | Development build for Android (cloud)       |
| `pnpm build:dev:ios`           | Development build for iOS (cloud)           |
| `pnpm build:dev:android:local` | Development build for Android (local)       |
| `pnpm build:dev:ios:local`     | Development build for iOS (local)           |
| `pnpm build:dev:simulator`     | Development build for iOS Simulator (local) |
| `pnpm build:preview:android`   | Preview build for Android (cloud)           |
| `pnpm build:preview:ios`       | Preview build for iOS (cloud)               |
| `pnpm build:prod:android`      | Production build for Android (cloud)        |
| `pnpm build:prod:ios`          | Production build for iOS (cloud)            |

**Local builds** run on your machine and require:

- **Android**: Android Studio, JDK 17+, Android SDK
- **iOS**: Xcode, CocoaPods, Apple Developer account (for device builds)

## Development Commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `pnpm dev`           | Start web + server in watch mode     |
| `pnpm dev:web`       | Start web app only                   |
| `pnpm dev:mobile`    | Start mobile app only (own terminal) |
| `pnpm run ci`        | Run every CI check locally, in order |
| `pnpm build`         | Build all packages and apps          |
| `pnpm typecheck`     | Run TypeScript type checking         |
| `pnpm lint`          | Run ESLint                           |
| `pnpm lint:fix`      | Run ESLint with auto-fix             |
| `pnpm format`        | Check Prettier formatting            |
| `pnpm format:fix`    | Fix Prettier formatting              |
| `pnpm test`          | Run tests                            |
| `pnpm db:push`       | Push Drizzle schema to database      |
| `pnpm db:studio`     | Open Drizzle Studio                  |
| `pnpm auth:generate` | Generate Better Auth schema          |
| `pnpm ui-add`        | Add shadcn/ui components             |
| `pnpm verify`        | Run typecheck, lint, and format      |

## Adding Components and Packages

### Add shadcn/ui Components

```bash
pnpm ui-add
```

### Add New Package

```bash
pnpm turbo gen init
```

This generates a new package with `package.json`, `tsconfig.json`, and configured tooling.

## Configuring Better Auth with Expo

### Option 1: Deploy Auth Proxy (Recommended)

Better Auth includes an [auth proxy plugin](https://www.better-auth.com/docs/plugins/oauth-proxy). Deploy the Next.js app to get a stable OAuth callback URL.

### Option 2: Local IP Configuration

Add your local IP (e.g., `192.168.x.y:PORT`) to your OAuth provider's allowed callback URLs.

## Deployment

### Web (Next.js) → Vercel

1. Create a new project on Vercel
2. Select `apps/web` as the root directory
3. Add `POSTGRES_URL` environment variable
4. Deploy

### Production Database Migrations

Production migrations are owned by the standalone server's start command (migrate-on-boot). The root script chains them:

```bash
pnpm start:server
# runs: TURBO_DB_SKIP_DOTENV=1 pnpm db:migrate && pnpm -F @turbo/server start:prod
```

How it works on each deploy:

1. The platform (e.g., Coolify) builds and starts a new container with `pnpm start:server`.
2. `pnpm db:migrate` applies only migrations the database hasn't seen (tracked in the Drizzle journal).
3. If migrations succeed, the server boots and the health check passes.
4. If migrations fail, the server never starts, the health check fails, and the previous version keeps serving.

On a brand-new (empty) database, the journal's first entry (`0000_baseline_auth_schema`) creates the Better Auth tables, so a fork's first deploy needs no manual `db:push`. Existing databases skip it because it is dated before their first applied migration, so nothing changes for them.

Requirements:

- Set `POSTGRES_URL` in the deployment environment. `TURBO_DB_SKIP_DOTENV=1` is baked into the script so migrate reads the injected environment instead of a local `.env` file.
- Keep exactly one migration owner: only the server's start command runs `db:migrate`. Other apps (web, mobile) never migrate.
- Keep migrations backward-compatible (expand/contract): add columns and tables first, drop or rename in a later release, since old code briefly runs against the new schema during the deploy window.

### Docker (Coolify / any container host)

`apps/web/Dockerfile` and `apps/server/Dockerfile` build slim multi-stage images (Next.js standalone for web, `pnpm deploy --prod` output for the server). Docker is an additional path: Vercel ignores Dockerfiles and the `output: "standalone"` switch (it is gated on `DOCKER_BUILD=1`, which only the web Dockerfile sets), and `pnpm start:server` keeps working on a plain VPS. Both targets coexist.

Build from the repo root — the context must be the monorepo, not the app folder:

```bash
docker build -f apps/web/Dockerfile -t turbo-web .
docker build -f apps/server/Dockerfile -t turbo-server .

docker run --rm -p 3000:3000 -e POSTGRES_URL=... -e AUTH_SECRET=... turbo-web
docker run --rm -p 3001:3001 -e POSTGRES_URL=... -e AUTH_SECRET=... -e RESEND_API_KEY=... turbo-server
```

What the images do:

- **web** serves `node apps/web/server.js` on port 3000. `NEXT_PUBLIC_*` values are inlined at build time, so pass them as `--build-arg` (every key in `apps/web/src/env.ts` has an `ARG`). `SENTRY_AUTH_TOKEN` is an optional BuildKit secret (`--secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN`); the build succeeds without it.
- **server** runs the same chain as `pnpm start:server` — `drizzle-kit migrate` then `tsx src/index.ts` — on port 3001 with `GET /health`.
- Both images boot through `scripts/infisical-run.sh` with the Infisical CLI on `PATH`. Set `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID` (or commit `.infisical.json`), and `INFISICAL_ENV` (e.g. `prod`) on the platform and the container pulls every other secret from Infisical at start. Leave them unset and the container runs on platform-injected env vars alone — there is no `.env` in the image either way.
- Neither image installs `apps/mobile`, dev toolchains, `.git`, or docs (see `.dockerignore`).

Coolify settings per app:

| Setting                            | Web                    | Server                    |
| ---------------------------------- | ---------------------- | ------------------------- |
| Build pack                         | `dockerfile`           | `dockerfile`              |
| Base directory                     | `/`                    | `/`                       |
| Dockerfile location                | `/apps/web/Dockerfile` | `/apps/server/Dockerfile` |
| Port                               | `3000`                 | `3001`                    |
| Health check                       | `GET /`                | `GET /health`             |
| Custom install/build/start command | clear all three        | clear all three           |
| `NEXT_PUBLIC_*` variables          | mark as **build time** | —                         |
| Watch paths                        | `apps/web/**` + shared | `apps/server/**` + shared |

Shared watch paths for both apps: `packages/**`, `tooling/**`, `scripts/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `.dockerignore`, `.nvmrc`, `.infisical.json` — everything the Dockerfiles copy after `.dockerignore` has filtered the context. Leave watch paths empty and every push rebuilds both images, docs included.

Auto-deploy needs a webhook. Coolify rebuilds on push only when GitHub tells it about the push: a **GitHub App** source sets that up for you, a **Public Repository** source does not, and pushes to `main` then sit undeployed until someone clicks Deploy. If you keep a public source, add a repository webhook per app — payload URL `https://<coolify-host>/webhooks/source/github/events/manual`, content type `application/json`, `push` events, secret = that app's GitHub webhook secret from its Webhooks tab. Each app has its own secret, so one webhook per app; keep the secrets out of the repo.

With Infisical, the only runtime variables Coolify needs are the four `INFISICAL_*` credentials above (plus anything you deliberately keep out of Infisical). Without it, `POSTGRES_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, … are normal Coolify environment variables. Layout and invariants: `.ai/patterns/docker-images.md`.

### WiFi voucher shop (Saleslip)

`apps/server` also hosts a single-tenant WiFi voucher shop for the Saleslip Starlink hotspot: a mobile-first buy page, Paystack checkout, a Telegram bot, and fulfilment that creates hotspot users on a MikroTik router over WireGuard. The long-term plan is in [`docs/wifi-platform-plan.md`](docs/wifi-platform-plan.md).

Routes (all on the server, port 3001):

| Route                                | Purpose                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `GET /`                              | Plan list. Accepts `mac`, `ip`, `login` from the MikroTik captive portal and carries them on. |
| `POST /orders`                       | Creates an order and redirects to Paystack.                                                   |
| `GET /orders/:id`                    | Receipt: polls until fulfilled, shows the code, a QR, and a **Connect now** button.           |
| `POST /webhooks/paystack`            | Paystack webhook. The only path that fulfils an order.                                        |
| `GET /webhooks/paystack/verify/:ref` | Manual recovery: asks Paystack to verify a reference and fulfils if paid.                     |
| `POST /webhooks/telegram/:secret`    | grammY webhook; 404 unless the secret matches `TELEGRAM_WEBHOOK_SECRET`.                      |
| `GET /health`                        | Database and router reachability.                                                             |

Plans are a TypeScript array in `packages/wifi/src/plans.ts` (shared by both runtimes as `@turbo/wifi`). Each plan references an existing RouterOS hotspot user profile, and the profile's on-login script owns expiry. Profile names come from `WIFI_PROFILE_DAILY_UNLIMITED`, `WIFI_PROFILE_DAILY_1GB` and `WIFI_PROFILE_WEEKLY_5GB`.

Environment (see `.env.example`):

| Variable                                                               | Notes                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_BASE_URL`, `BRAND_NAME`, `SUPPORT_PHONE`                       | Public URL used in Paystack callbacks and Telegram links; shop branding.                                                                |
| `ROUTER_HOST`, `ROUTER_PORT`, `ROUTER_API_USER`, `ROUTER_API_PASSWORD` | RouterOS API over the tunnel (`10.8.0.2:8728`, plain API). `ROUTER_DISABLED=1` runs without a router (orders park in `pending_router`). |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`                           | Paystack keys. `PAYSTACK_DISABLED=1` disables checkout.                                                                                 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ADMIN_IDS`  | Bot token, a random path secret, comma-separated owner user IDs (`/status`, outage alerts).                                             |
| `WG_GATEWAY_HOST`                                                      | Container only: the wg-easy container the entrypoint routes `10.8.0.0/24` through.                                                      |
| `WIFI_HOTSPOT_SERVER`                                                  | Optional: the RouterOS hotspot server name when the router runs more than one (`server=` on created users). Unset means all servers.   |
| `SERVER_URL`                                                           | Web only: where the console proxy forwards `/api/wifi-router/*` (for example `http://server:3001`).                                     |
| `WIFI_PROFILE_DAILY_UNLIMITED`, `WIFI_PROFILE_DAILY_1GB`, `WIFI_PROFILE_WEEKLY_5GB` | RouterOS hotspot user profile names per plan; both runtimes must resolve the same values.                                  |

Fulfilment: `charge.success` (signature-checked, idempotent by reference) marks the order paid, generates a `GW#####` code, creates the hotspot user (`username = password = code`, the plan's profile, comment `saleslip|<orderId>|<phone>`, `limit-bytes-total` for data plans), stores the voucher and marks the order fulfilled. Telegram orders get the code by DM. If the router is unreachable the order becomes `pending_router` and an in-process retry with backoff finishes it; the sweep also runs on boot. A watchdog DMs the admins when the router has been down for five minutes and again when it recovers.

### WiFi admin console (Saleslip)

The web dashboard at `/dashboard/wifi` is the operator surface: revenue and order stats, every order, every issued code, counter batches, and a **Live** tab showing who is online. It reads through `/api/wifi/*`.

Minting is the part that has to be right. A counter batch is created and activated in one step: the codes are inserted **and** the corresponding RouterOS hotspot users are created inside a single database transaction, so a batch that cannot be fully activated rolls back and returns an error instead of printing a sheet of codes that do not work. Revoking removes the hotspot user *before* marking the row revoked — if the router is unreachable the voucher stays active and the request 503s, because a "revoked" code that still connects is worse than a failed revoke.

Those routes need a route to the router, which only `apps/server` has. They therefore live in their own Hono app (`createWifiRouterApp` in `packages/api/src/router/wifi-router.ts`), mounted at `/wifi-router` on `apps/server` and never on `apps/web`; the browser reaches them through the same-origin proxy at `/api/wifi-router/*`, which forwards the session cookie to `SERVER_URL`. See "Router-only routes" in [`ARCHITECTURE.md`](ARCHITECTURE.md).

| Console route (browser-facing)           | Purpose                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/wifi-router/health`            | Router reachability plus `/system/resource`. A down router is `reachable: false`, still HTTP 200. |
| `GET /api/wifi-router/sessions`          | Live hotspot sessions resolved back to their voucher, plan and phone, with today's revenue. |
| `POST /api/wifi-router/sessions/sync`    | Snapshots `bytes-in + bytes-out` per code onto `wifi_voucher.bytes_used`.       |
| `POST /api/wifi-router/sessions/:user/kick` | Disconnects a live session.                                                  |
| `POST /api/wifi-router/vouchers/batch`   | Mints and activates a counter batch.                                            |
| `POST /api/wifi-router/vouchers/:id/activate` | Activates one voucher; 409 when it already is.                             |
| `POST /api/wifi-router/vouchers/:id/revoke` | Removes the hotspot user, then marks the voucher revoked.                     |

Usage is a snapshot, not a live meter: there is no `expires_at` column in the database, because expiry lives in the router profile's on-login script and RouterOS does not expose a per-user expiry to read back. Uptime in the Live tab comes from the active session instead.

Setup checklist:

1. **Paystack** — in the dashboard set the webhook URL to `${PUBLIC_BASE_URL}/webhooks/paystack` (for example `https://wifi.saleslip.app/webhooks/paystack`) and copy the secret key into `PAYSTACK_SECRET_KEY`. The redirect back to `/orders/:id` never fulfils; only the webhook does.
2. **Telegram** — create the bot with [@BotFather](https://t.me/BotFather) (`/newbot`), put the token in `TELEGRAM_BOT_TOKEN`, generate a random `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`), and put the owners' numeric user IDs in `TELEGRAM_ADMIN_IDS`. The server calls `setWebhook` to `${PUBLIC_BASE_URL}/webhooks/telegram/<secret>` on boot.
3. **MikroTik** — the API user needs `api` + `write` policy on the hotspot. Add walled-garden entries so unpaid clients can reach the shop, Paystack and Telegram: `*.saleslip.app`, `*.paystack.co`, `*.paystack.com`, `*.telegram.org`, `t.me`, and the VPS IP `195.179.227.24`. Point the login page's buy link at `${PUBLIC_BASE_URL}/?mac=$(mac)&ip=$(ip)&login=$(link-login-only)`.
4. **Database** — the app reads `POSTGRES_URL`; migrations run on boot. In production point it at the shared Coolify Postgres with a dedicated `saleslip` role and database.
5. **Deploy** — add the block in [`deploy/coolify-compose.snippet.yaml`](deploy/coolify-compose.snippet.yaml) to the `saleslip-wifi` stack. It needs `cap_add: NET_ADMIN` and `WG_GATEWAY_HOST=wg-easy`; `apps/server/docker-entrypoint.sh` adds `ip route replace 10.8.0.0/24 via <wg-easy>` before dropping to the `node` user.
6. **Router check** — the tunnel is only reachable from the VPS, so verify from the deployed container: `pnpm --filter @turbo/server routeros:check` prints `/system/resource`.

### Auth Proxy

The auth proxy is a Better Auth plugin for OAuth in preview deployments. Deploy the Next.js app to Vercel to enable it.

### Mobile (Expo) → App Stores

1. Update `getBaseUrl` in `apps/mobile/src/utils/api.tsx` to point to production URL

2. Build for production:

   ```bash
   cd apps/mobile
   pnpm build:prod:ios
   pnpm build:prod:android
   ```

3. Submit to app stores:

   ```bash
   eas submit --platform ios --latest
   eas submit --platform android --latest
   ```

4. Publish OTA updates:
   ```bash
   eas update --auto
   ```
