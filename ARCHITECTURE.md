# Architecture

This repository is a full-stack TypeScript monorepo. Deployable apps live in
`apps/`; shared capabilities live in `packages/`; shared toolchain configuration
lives in `tooling/`.

## Mental Model

- `apps/web` is the Next.js App Router application and public web runtime.
- `apps/server` is the standalone Node/Hono runtime for the shared API app. It
  also hosts the single-tenant WiFi voucher shop (`apps/server/src/wifi`):
  server-rendered buy/receipt pages, the Paystack webhook, fulfilment against
  the router, and the Telegram bot.
- `apps/mobile` is the Expo Router mobile application.
- `packages/api` owns business API routes through Hono routers.
- `packages/auth` owns Better Auth runtime configuration and auth generation.
- `packages/db` owns Drizzle/Postgres schema and database clients.
- `packages/ui` owns shared web UI components following shadcn/ui patterns.
- `packages/validators` owns shared Zod contracts.
- `packages/jobs` owns Trigger.dev background tasks.
- `packages/routeros` owns the typed MikroTik RouterOS API wrapper (hotspot
  users, active sessions, kick, system resource).
- `packages/wifi` owns WiFi domain logic shared by `apps/server` and
  `packages/api`: voucher codes, order state machine, plan catalogue, naira and
  data formatting, and counter batch minting. It is runtime-agnostic; nothing in
  it may import Next.js, React, or `node-routeros` at module scope except
  `plans.ts`, which is why `apps/web` client code imports the `@turbo/wifi/format`
  subpath instead of the barrel.
- `packages/paystack` owns the Paystack client (initialize/verify) and webhook
  signature verification.
- `tooling/*` owns reusable ESLint, Prettier, TypeScript, Tailwind, and Vitest
  configuration.

## Request Flow

```text
Web or mobile UI
  -> typed Hono RPC client
  -> packages/api/src/router/*
  -> validators, auth, db, jobs, mail, analytics
  -> typed JSON response
```

The web app mounts the Hono API in `apps/web/src/app/api/[[...route]]/route.ts`.
The standalone server hosts the same API app from `apps/server` under `/api` and
keeps a root `/health` runtime check. Better Auth handlers are mounted under
`/api/auth/*` by each runtime. Business logic belongs in
`packages/api/src/router/`, not in app-local API route handlers or runtime
entrypoints. Adapters for external APIs, when a feature needs one, live beside
the routers in `packages/api/src/providers/` and hold no business logic
(`.ai/patterns/external-provider-boundary.md`; none exist yet). The API app is
created in `packages/api/src/index.ts` and exports `AppType` for typed clients.

### Router-only routes

Some routes are only servable by one runtime. The WiFi console needs the
MikroTik router, and only `apps/server` has a WireGuard route to `10.8.0.0/24`,
so those routes cannot live in `createApp` — both runtimes mount it, and adding
them there would advertise endpoints one host cannot serve.

They live in `packages/api/src/router/wifi-router.ts`
(`createWifiRouterApp`, exporting its own `WifiRouterAppType`), which
`apps/server/src/app.ts` mounts at `/wifi-router` only when a `HotspotService`
exists. `apps/web` reaches them through the same-origin proxy at
`apps/web/src/app/api/wifi-router/[...path]/route.ts`, which forwards the
session cookie to `SERVER_URL`. This is why `AppType` deliberately excludes the
router app and the web hooks build a client with `createWifiRouterClient`
instead of the shared `hc<AppType>` client. Follow the same shape for any future
route that one runtime alone can serve.

## Frontend Data Flow

- Use server components by default in `apps/web/src/app` when no client
  interactivity is needed.
- Use the typed Hono client for API calls.
- Use TanStack Query for client-side server state.
- Use Zustand only for shared client-side UI state.
- Use `react-hook-form` with Zod resolvers for forms.
- Use route params/search params for URL state.

## Backend Boundaries

- Hono routers live in `packages/api/src/router/` and use `Hono<AppContext>`.
- Runtime entrypoints such as `apps/web` and `apps/server` may host the shared
  API app, but must not own business API logic. The WiFi voucher shop is the
  documented exception: it is a server-rendered product surface for one runtime
  (`.ai/specs/active/wifi-voucher-mvp.spec.md`), and its reusable logic lives in
  `packages/routeros` and `packages/paystack`.
- Protected routes apply `authMiddleware` or another explicit auth guard.
- Shared request/response validation lives in `packages/validators` when reused
  across packages or apps.
- Drizzle schemas live in `packages/db/src/*-schema.ts` and are exported through
  `packages/db/src/schema.ts` or `packages/db/src/index.ts`.
- Better Auth schema changes are generated with `pnpm auth:generate`.

## Package Boundaries

- Apps may import packages.
- Packages must not import from apps.
- Package public APIs are declared in each package's `package.json` `exports`
  field.
- Internal packages use the `@turbo/*` scope and ESM.

## Agent Context Sources

- Universal workflow: `AGENTS.md`
- Tool-specific entrypoints: `.github/copilot-instructions.md`, `CLAUDE.md`,
  `.cursor/rules/*.mdc`
- Repo facts: `.ai/context/*`
- Task procedures: `.ai/skills/*`
- Patterns: `.ai/patterns/*`
- Architecture decisions: `.ai/decisions/*`
- Generated contract snapshots: `.ai/contracts/*.generated.md`
- Active implementation ledger: `ROADMAP_AI.md`

When these sources conflict, prefer observed code and package configuration,
then update the stale documentation in the same change.
