# Feature Spec: WiFi admin console (Saleslip)

## Status

- State: implemented (slices A + B + C).
- Owner: AI agent
- Created: 2026-09-22
- Updated: 2026-09-22

## Problem

The WiFi voucher MVP sells and fulfils end to end, but every admin action still
happens through Mikhmon, the Telegram bot, or raw SQL. There is no way to sell a
voucher for cash over the counter, and no way to see revenue, pending orders, or
issued codes from the web dashboard.

Four concrete blockers:

1. `apps/web` has no WiFi surface — `nav-config.ts` and
   `packages/api/src/router/` know nothing about the hotspot.
2. Voucher domain logic (`voucher-code.ts`, `plans.ts`, `order-state.ts`) lives
   inside `apps/server/src/wifi/`, which is an application, not a package, so
   `packages/api` cannot import it without forking it.
3. `wifi_voucher.orderId` is `NOT NULL`, so a voucher cannot exist without a
   paid order. Counter sales need standalone batches.
4. Nothing in the web dashboard can reach RouterOS, so counter vouchers had to
   be activated by hand in Mikhmon and there was no view of who is online. An
   operator minting a code in the console handed out a code that did not work.

## Scope

Three slices; all three ship in this change.

| Slice | Content                                   | Router needed             |
| ----- | ----------------------------------------- | ------------------------- |
| A     | Orders, payments, vouchers, revenue stats | No — Postgres reads only  |
| B     | Voucher batches, revoke, print sheet      | Yes — activation          |
| C     | Live sessions, kick, usage sync, health   | Yes — reads + kick        |

## Acceptance Criteria

- [x] `packages/wifi` exports the shared domain (`order-state`, `plans`,
      `voucher-code`, formatters) and `apps/server` imports it instead of
      keeping private copies.
- [x] Migration `0004` adds `wifi_voucher_batch` and makes
      `wifi_voucher.order_id` nullable, so a voucher can belong to a batch
      instead of an order.
- [x] `GET /api/wifi/orders` lists orders with status filter, paging, and a
      total count.
- [x] `GET /api/wifi/vouchers` lists vouchers with status/batch filter, paging,
      and a total count.
- [x] `GET /api/wifi/stats` reports today's paid orders and revenue, order
      counts by status, and voucher counts by status.
- [x] `GET /api/wifi/plans` returns the plan catalogue with prices and RouterOS
      profile names, so the UI never hard-codes them.
- [x] `POST /api/wifi/vouchers/batch` mints N unique codes for a plan, records
      a batch row, and is atomic (all codes or none).
- [x] `POST /api/wifi/vouchers/:id/revoke` revokes a voucher and is idempotent.
- [x] Every WiFi route requires an authenticated session — the payload carries
      customer phone numbers and revenue.
- [x] The dashboard gains a WiFi nav group, an orders table, a vouchers table,
      a stat row, and a generate-batch dialog, composed from the house
      primitives (`StatCard`, `TableCard`, `PageToolbar`, `TablePagination`,
      `QueryError`, `HintLabel`).
- [x] `packages/wifi` unit tests cover code generation, order transitions, plan
      mapping, formatters, and batch minting.

### Slice C — router-backed

- [x] Migration `0005` adds `activated_at`, `bytes_used`, `synced_at` and
      `last_error` to `wifi_voucher`, so activation state and usage survive a
      restart.
- [x] `POST /api/wifi-router/vouchers/batch` mints a batch **and creates every
      hotspot user on RouterOS**. Atomic across both: any router failure rolls
      the whole batch back, so a returned sheet is always a working sheet.
- [x] `POST /api/wifi-router/vouchers/:id/revoke` revokes a voucher **and
      removes the hotspot user**, so a revoked code stops working immediately.
- [x] `POST /api/wifi-router/vouchers/:id/activate` retries activation for a
      single voucher (a shop voucher whose fulfilment exhausted its retries).
- [x] `GET /api/wifi-router/sessions` lists live hotspot sessions joined to the
      voucher, order and plan that own them.
- [x] `POST /api/wifi-router/sessions/:user/kick` drops every active session for
      a username and reports how many were dropped.
- [x] `POST /api/wifi-router/sessions/sync` snapshots bytes used and uptime into
      `wifi_voucher`, so usage outlives the session.
- [x] `GET /api/wifi-router/health` reports router reachability, version, board,
      CPU and memory — the console shows it instead of failing silently.
- [x] The router-backed app is **only mounted where a router exists**
      (`apps/server`). Its routes are absent from the Next-hosted app, and the
      browser reaches them through a same-origin Next proxy that forwards the
      session cookie, so no new CORS surface and no cookie-domain change.
- [x] The console gains a live sessions table with kick, a router health card,
      and a sync action; mint and revoke dialogs no longer warn about Mikhmon.

## Expected Files

| File                                                     | Expected change                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/wifi/**`                                       | New `@turbo/wifi` package: shared WiFi domain + tests               |
| `packages/db/src/wifi-schema.ts`                         | `wifi_voucher_batch`; nullable `orderId`; `channel` + ownership CHECK; slice C adds `activatedAt`, `bytesUsed`, `syncedAt`, `lastError` |
| `packages/db/drizzle/0004_wifi_voucher_batches.sql`      | Migration — batches + nullable owner                                |
| `packages/db/drizzle/0005_wifi_voucher_activation.sql`   | Migration — activation + usage columns                              |
| `packages/api/src/router/wifi.ts`                        | Read-only console router (slices A + B reads)                       |
| `packages/api/src/router/wifi-router.ts`                 | New router-backed app (slice C), exported with its own client type  |
| `packages/api/src/wifi/repository.ts`                    | `findVoucher`, `markActivated`, `markActivationFailed`, `recordUsage`, `revokeVoucher` |
| `packages/api/src/wifi/router-client.ts`                 | `hc` client factory + `WifiRouterAppType` for the router-backed app |
| `apps/server/src/app.ts`                                 | Mount `/api/wifi-router` only when a hotspot service exists         |
| `apps/server/src/wifi/bootstrap.ts`                      | Pass the built `HotspotService` into the router-backed app          |
| `apps/web/src/app/api/wifi-router/[...path]/route.ts`    | Same-origin proxy to `SERVER_URL`, forwarding cookies               |
| `apps/web/src/hooks/use-wifi-router.ts`                  | Sessions, kick, sync, health, activate hooks                        |
| `apps/web/src/components/dashboard/wifi/wifi-sessions-table.tsx` | Live sessions + kick                                        |
| `apps/web/src/components/dashboard/wifi/wifi-router-health.tsx`  | Router reachability card                                    |
| `apps/server/src/wifi/{plans,voucher-code,order-state}.ts` | Moved to `packages/wifi/src/`; importers repointed to `@turbo/wifi` |
| `apps/server/src/wifi/*.ts`                              | Import from `@turbo/wifi`                                           |
| `apps/web/src/hooks/use-wifi*.ts`                        | Typed query hooks + batch mutation                                  |
| `apps/web/src/components/dashboard/nav-config.ts`        | `wifiNav` group                                                     |
| `apps/web/src/components/dashboard/wifi/**`              | Stat row, orders table, vouchers table, batch dialog, batch list, tabs |
| `apps/web/src/app/dashboard/wifi/**`                     | Orders and vouchers routes                                          |
| `apps/web/src/components/dashboard/nav-config.ts`        | `wifiNav` group + `CUSTOM_ROUTE_SLUGS`                               |
| `apps/web/src/env.ts`                                    | Optional `WIFI_PROFILE_*` so the web runtime resolves the same profiles |
| `.ai/context/*`, `ROADMAP_AI.md`                         | AI memory + ledger                                                  |

## Contracts

| Contract        | Change? | Notes                                                                 |
| --------------- | ------- | --------------------------------------------------------------------- |
| API routes      | yes     | `/api/wifi/*` on the Next-hosted app; `/api/wifi-router/*` on `apps/server` only |
| DB schema       | yes     | `wifi_voucher_batch`; nullable `order_id`; activation + usage columns |
| Env vars        | yes     | Optional `WIFI_PROFILE_*` (web) and `SERVER_URL` (web proxy target); `ROUTER_*` already on the server |
| Package exports | yes     | New `@turbo/wifi`; new `WifiRouterAppType` from `@turbo/api`           |
| UI tokens       | no      | Composes existing semantic tokens only                                |
| Agent memory    | yes     | `ARCHITECTURE.md`, `.ai/context/tech-stack.md`, `ROADMAP_AI.md`        |

## Pseudocode

```text
POST /api/wifi/vouchers/batch                                    # slice A read path
  auth -> validate {planId, quantity<=200, label} -> findPlan
  -> repo.createVoucherBatch(label, plan, quantity, createdBy)
       tx: insert batch row
           for i in 1..quantity:
             code = generateUniqueVoucherCode(exists)   # retried, alphabet-safe
             insert voucher {batchId, code, profile, limitBytesTotal, channel:'manual'}
  -> { batch, vouchers }

GET /api/wifi/{orders,vouchers}
  auth -> filters + limit/offset -> { rows, total }  # one count(*) alongside the page

GET /api/wifi/stats
  today  = repo.todaySummary()
  orders = group by status
  vouchers = group by status
  -> { today, orders, vouchers }

# --- slice C: only mounted on apps/server, which owns the WireGuard route ---

POST /api/wifi-router/vouchers/batch         # activating mint, atomic over DB + ROS
  auth -> findPlan -> hotspot required, else 503
  tx:
    insert batch row
    codes = mintVoucherBatch(...)            # unique against wifi_voucher
    insert voucher rows {batchId, code, profile, limitBytesTotal, channel:'manual'}
    for each voucher:                        # username == password == code
      try  rosId = hotspot.createHotspotUser(toHotspotUserInput(plan, {code, batchId}))
           voucher.activatedAt = now, activatedAt persisted
      catch RouterOsCommandError  -> throw ActivationError(code, message)   # rolls back
      catch RouterOsUnavailableError -> throw ActivationUnavailableError    # rolls back
  -> 201 { batch, vouchers }                 # every returned code is live

POST /api/wifi-router/vouchers/:id/revoke
  auth -> voucher = repo.findVoucher(id) or 404
  if voucher.rosId:
    try hotspot.removeUser(voucher.rosId)   # idempotent: absent user is fine
    catch unavailable -> 503, leave voucher active   # never claim a lie
  repo.revokeVoucher(id)                    # idempotent
  -> { voucher }

POST /api/wifi-router/vouchers/:id/activate
  auth -> voucher or 404 -> already activated? 409
  hotspot.createHotspotUser(...) -> repo.markActivated(rosId, now)
  -> { voucher }

GET /api/wifi-router/sessions
  auth -> sessions = hotspot.listActive()   # uniform 503 when unreachable
       -> enrich: usernames -> wifi_voucher + wifi_order + plan name
  -> { sessions, live: n, revenueKoboToday }

POST /api/wifi-router/sessions/:user/kick
  auth -> count = hotspot.kick(user) -> { kicked: count }

POST /api/wifi-router/sessions/sync
  auth -> users = hotspot.listUsers()
       -> recordUsage: code -> bytesIn + bytesOut, syncedAt
  -> { synced: n, syncedAt }

GET /api/wifi-router/health
  auth -> hotspot.systemResource() -> { reachable: true, error: null, resource }
       -> on RouterOsUnavailableError: { reachable: false, error, resource: null }  # 200, not 500
```

## Validation Plan

- [x] `pnpm --filter @turbo/wifi test`
- [x] `pnpm --filter @turbo/db typecheck`, `pnpm --filter @turbo/api typecheck`
- [x] `pnpm turbo run build --filter=@turbo/api^...` then `pnpm --filter @turbo/api test`
- [x] `packages/api` unit tests for the router-backed app with a fake
      `HotspotService`: activation rollback on `RouterOsCommandError`, activation
      rollback on `RouterOsUnavailableError`, revoke leaves the voucher active
      when the router is down, kick count, sync snapshot, health degraded mode,
      and 503 when `hotspot` is `undefined`.
- [x] A dev-server request proves the `/api/wifi-router/*` proxy resolves ahead
      of the `/api/[[...route]]` catch-all.
- [x] `pnpm ai:contracts`
- [x] `pnpm design:lint`, `pnpm design:tokens`, `pnpm ui:composition`
- [x] `pnpm run ci` (root merge gate)

## Rollback Plan

Both migrations are additive: `wifi_voucher.order_id` only loses its `NOT NULL`,
and no column is dropped, so they are safe to leave in place.

To stop serving router-backed routes, remove the `.route("/api/wifi-router", …)`
mount from `apps/server/src/app.ts` and revert the web proxy; the console falls
back to the slice A/B read surfaces and minting returns 503. The codes already
activated on the router keep working, which is the safe direction.

To fully revert, drop `wifi_voucher_batch` and its FK after deleting
batch-owned vouchers, then restore `NOT NULL` on `wifi_voucher.order_id`. Note
that this leaves hotspot users on the router with no database record; run
`POST /sessions/sync` first, or clean them up in the router's hotspot user list.

## Notes

- **The router-backed surface is a separate Hono app, not a flag.**
  `createApp` is mounted by *both* `apps/web` (Next route handler) and
  `apps/server`. Adding router routes to it would advertise endpoints that only
  one host can serve, and the shared `AppType` would lie to the web client.
  So `packages/api/src/router/wifi-router.ts` builds its own app with its own
  exported type, and `apps/server/src/app.ts` mounts it under `/wifi-router`
  **only when a `HotspotService` exists**. Because it is not a child of
  `apiApp`, it re-applies `secureHeadersMiddleware()` and
  `contextMiddleware(auth, db)` itself and omits the middleware that only
  matters for browser-facing traffic (CORS, rate limiting, CSRF, timing).
- **The browser reaches router routes through a same-origin proxy.**
  `apps/web/src/app/api/wifi-router/[...path]/route.ts` forwards to
  `SERVER_URL` and passes the incoming `cookie` header through. This avoids
  three problems at once: no CORS entry for a second origin, no
  `Domain=.saleslip.app` cookie change, and no `SameSite` regression. The
  upstream call is server-to-server; the session is validated by
  `apps/server`, which shares `AUTH_SECRET` and the same Postgres.
- **Activation is fail-closed, and that is deliberate.** A batch is atomic over
  the database *and* the router: if any hotspot user cannot be created, the
  transaction rolls back and the route returns an error rather than a sheet.
  The whole point of slice C is that a code handed to a customer works, so a
  partially-activated batch would reintroduce exactly the bug it fixes.
- **Revoke refuses to lie.** If the router is unreachable the voucher stays
  active and the route returns 503. Marking it revoked while the hotspot user
  still works would let a "revoked" code keep connecting.
- **`wifi-router` is not spelled `wifi/…` on purpose.** The proxy path is a
  static segment (`/api/wifi-router/*`), which keeps it unambiguous against the
  Next optional catch-all at `/api/[[...route]]`.
- **Two writers, one retry engine — still true.** Background retry stays in
  `apps/server/src/wifi/fulfilment.ts`; the console activates synchronously and
  reports failures inline. The console does not schedule retries, so the
  `pending_router` backoff keeps a single owner. `activate` exists for the
  manual retry of a shop voucher that exhausted that budget.
- **`hotspot` is optional, so routes must handle its absence.** With
  `ROUTER_DISABLED` set (tests, local dev) the app is mounted but every
  router-backed route returns 503 with a clear message; the console renders
  "router not configured" instead of an error state.
- **Usage is snapshotted, not streamed.** RouterOS reports bytes on the hotspot
  user record, so `POST /sessions/sync` copies `bytes-in + bytes-out` into
  `wifi_voucher.bytes_used` with a `synced_at` stamp. There is no `expires_at`
  column: expiry lives in the router profile's on-login script, and the router
  does not expose a per-user expiry to read back, so storing one would be a
  guess. Uptime comes from the live session instead.
- **Profile names must match.** Vouchers reference the RouterOS profile by name,
  so the web runtime and the server runtime must resolve the same
  `WIFI_PROFILE_*` values. Documented in `.env.example`.
- **`channel: "manual"`** marks batch-minted codes so revenue reporting can
  exclude them; `todaySummary` counts `wifi_order` rows only.
- **Plans are named `rosProfile` in the domain, `profile` on the wire.** The
  `WifiPlan` field mirrors the RouterOS profile it maps to; the `/plans` route
  renames it to `profile` for the UI rows. A `WifiPlanOption` therefore does not
  have the same shape as a `WifiPlan`.
- **Client code imports `@turbo/wifi/format`, never the barrel.**
  `packages/wifi/src/plans.ts` pulls in `@turbo/routeros` (node-only) at module
  scope, so a `"use client"` component importing the barrel breaks the bundle.
  The `./format` subpath export exists for exactly this.
- **No stale caveat survives in the UI.** The old batch and revoke dialogs
  warned that codes still had to be created and deleted by hand in Mikhmon.
  Slice C removes both warnings; leaving them would train operators to
  double-check a system that now does the work.
