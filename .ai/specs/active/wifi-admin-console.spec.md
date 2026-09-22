# Feature Spec: WiFi admin console (Saleslip)

## Status

- State: implemented (slices A + B). Slice C designed here, not built.
- Owner: AI agent
- Created: 2026-09-22
- Updated: 2026-09-23

## Problem

The WiFi voucher MVP sells and fulfils end to end, but every admin action still
happens through Mikhmon, the Telegram bot, or raw SQL. There is no way to sell a
voucher for cash over the counter, and no way to see revenue, pending orders, or
issued codes from the web dashboard.

Three concrete blockers:

1. `apps/web` has no WiFi surface — `nav-config.ts` and
   `packages/api/src/router/` know nothing about the hotspot.
2. Voucher domain logic (`voucher-code.ts`, `plans.ts`, `order-state.ts`) lives
   inside `apps/server/src/wifi/`, which is an application, not a package, so
   `packages/api` cannot import it without forking it.
3. `wifi_voucher.orderId` is `NOT NULL`, so a voucher cannot exist without a
   paid order. Counter sales need standalone batches.

## Scope

Three slices, split by whether the router is reachable from the web runtime.
Only A and B ship in this change; C is designed here and deferred.

| Slice | Content                                   | Router needed            |
| ----- | ----------------------------------------- | ------------------------ |
| A     | Orders, payments, vouchers, revenue stats | No — Postgres reads only |
| B     | Voucher batches, revoke, print sheet      | Only to activate on ROS  |
| C     | Live sessions, kick, usage sync, health   | Yes — deferred           |

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

## Expected Files

| File                                                     | Expected change                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/wifi/**`                                       | New `@turbo/wifi` package: shared WiFi domain + tests               |
| `packages/db/src/wifi-schema.ts`                         | `wifi_voucher_batch`; nullable `orderId`; `channel` + ownership CHECK. `bytesUsed`, `expiresAt`, `syncedAt` are slice C — not added |
| `packages/db/drizzle/0004_wifi_voucher_batches.sql`      | Migration                                                           |
| `packages/db/drizzle/meta/_journal.json`                 | Migration entry                                                     |
| `packages/api/src/router/wifi.ts`                        | New router (slices A + B)                                           |
| `packages/api/src/index.ts`                              | Mount `/wifi`; accept optional plan overrides                       |
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
| API routes      | yes     | New `/api/wifi/*` on the Next-hosted Hono app                         |
| DB schema       | yes     | `wifi_voucher_batch`; `wifi_voucher.order_id` becomes nullable        |
| Env vars        | yes     | Optional `WIFI_PROFILE_*` added to the web env contract               |
| Package exports | yes     | New `@turbo/wifi`                                                     |
| UI tokens       | no      | Composes existing semantic tokens only                                |
| Agent memory    | yes     | `ARCHITECTURE.md`, `.ai/context/tech-stack.md`, `ROADMAP_AI.md`        |

## Pseudocode

```text
POST /api/wifi/vouchers/batch
  auth -> validate {planId, quantity<=200, label} -> findPlan
  -> repo.createVoucherBatch(label, plan, quantity, createdBy)
       tx: insert batch row
           for i in 1..quantity:
             code = generateUniqueVoucherCode(exists)   # retried, alphabet-safe
             insert voucher {batchId, code, profile, limitBytesTotal, channel:'manual'}
  -> { batch, vouchers }

POST /api/wifi/vouchers/:id/revoke
  auth -> repo.revokeVoucher(id)  # idempotent; active -> revoked only

GET /api/wifi/{orders,vouchers}
  auth -> filters + limit/offset -> { rows, total }  # one count(*) alongside the page

GET /api/wifi/stats
  today  = repo.todaySummary()
  orders = group by status
  vouchers = group by status
  -> { today, orders, vouchers }
```

## Validation Plan

- [x] `pnpm --filter @turbo/wifi test`
- [x] `pnpm --filter @turbo/db typecheck`, `pnpm --filter @turbo/api typecheck`
- [x] `pnpm turbo run build --filter=@turbo/api^...` then `pnpm --filter @turbo/api test`
- [x] `pnpm ai:contracts`
- [x] `pnpm design:lint`, `pnpm design:tokens`, `pnpm ui:composition`
- [x] `pnpm run ci` (root merge gate)

## Rollback Plan

The migration is additive: `wifi_voucher.order_id` only loses its `NOT NULL`,
no column is dropped, so it is safe to leave in place. Revert the deploy to stop
serving `/api/wifi/*`; existing purchases keep fulfilling through `apps/server`.
To fully revert, drop `wifi_voucher_batch` and its FK after deleting batch-owned
vouchers, then restore `NOT NULL` on `wifi_voucher.order_id`.

## Notes

- **Slice C is deliberately out of scope.** `apps/web` has no WireGuard route
  into `10.8.0.0/24` — only `saleslip-server` does (`cap_add: NET_ADMIN` plus
  `apps/server/docker-entrypoint.sh`). Adding it means a second container with
  RouterOS credentials and a second writer against the router, so it needs its
  own decision. Live sessions, kick, sync, and router health land there.
- **Two writers, one retry engine.** Background retry stays in
  `apps/server/src/wifi/fulfilment.ts`. The console writes voucher rows
  synchronously and reports failures inline; it does not schedule retries, so
  `pending_router` backoff keeps a single owner.
- **Profile names must match.** Vouchers reference the Mikhmon-created RouterOS
  profile by name, so the web runtime and the server runtime must resolve the
  same `WIFI_PROFILE_*` values. Documented in `.env.example`.
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
- **Slice C leaves a visible gap in the UI.** Revoked and batch-minted vouchers
  are removed from Postgres but not from the router — counter codes still live in
  Mikhmon until activated there. Both the batch dialog and the revoke dialog say
  so, because an operator who assumes otherwise will double-sell a code.
