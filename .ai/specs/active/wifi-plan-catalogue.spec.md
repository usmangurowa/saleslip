# Feature Spec: DB-backed WiFi plan catalogue + plan management UI

## Status

- State: implemented
- Owner: AI agent
- Created: 2026-02-27
- Updated: 2026-09-24

## Problem

The plan catalogue is hardcoded in `buildPlans()` (`packages/wifi/src/plans.ts`).
Admins who create or rename a RouterOS profile on the Profiles tab must change
code + deploy to make a new sellable plan appear in `/buy`, the batch-mint
dropdown, and checkout. The user asked: "when generating vouchers can we
automatically see any new profile we recently add?"

Autopilot assumption (user unavailable): proceed with a DB-backed plan catalogue
plus an admin Plans tab. This touches the DB schema and public API; it is
backward-compatible via a seed migration and a fallback to `buildPlans(env)`.

## Acceptance Criteria

- [x] `wifi_plan` DB table stores the catalogue; a migration seeds the 6 current
      plans using **production** RouterOS profile names (`1-Day-Unlimited`,
      `Duo-1-Day`, `1-Week-Unlimited`, `Duo-1-Week`, `1-Month-Unlimited`,
      `Duo-1-Month`) so minting keeps working after deploy.
- [x] `GET /wifi/plans` (console) reads from the DB, preserving the existing
      response shape (`profile`, `dataLimitBytes`); supports `?includeInactive=1`
      for the management view.
- [x] New admin routes: `POST /wifi/plans` (create) and
      `PATCH /wifi/plans/:id` (edit / soft-deactivate). Admin-gated like the rest
      of the console router.
- [x] `wifi-router.ts` (sessions, vouchers/batch, vouchers/:id/activate) resolves
      plans from the DB via the repo instead of `resolvePlans()`.
- [x] Server runtime (`apps/server`) reads plans through a dynamic
      `loadPlans()` (DB read, falling back to `buildPlans(env)` on error or
      empty table) so a plan added after boot is immediately sellable.
- [x] `/buy` lists plans from the DB (fallback to `buildPlans()`).
- [x] Plans tab in the WiFi console: table (name, price, profile, validity,
      active), create/edit dialog with a RouterOS profile dropdown fed by the
      router profiles endpoint, and deactivate action.
- [x] Adding a plan in the UI makes it appear in the batch-mint dropdown and on
      `/buy` without a deploy (query invalidation / per-request reads).

## Expected Files

| File | Expected change |
| ---- | --------------- |
| `packages/db/src/wifi-schema.ts` | add `wifiPlan` table |
| `packages/db/drizzle/0008_wifi_plans.sql` + `meta/*` | migration + seed |
| `packages/api/src/wifi/repository.ts` | `listPlans` / `createPlan` / `updatePlan` |
| `packages/api/src/router/wifi.ts` | GET from DB + POST/PATCH plan CRUD |
| `packages/api/src/router/wifi-router.ts` | repo plan lookups |
| `apps/server/src/wifi/deps.ts`, `bootstrap.ts`, `checkout.ts`, `fulfilment.ts`, `voucher-email.ts` | `plans` → `loadPlans()` |
| `apps/web/src/app/buy/page.tsx` | DB-backed plan list |
| `apps/web/src/components/dashboard/wifi/wifi-tabs.tsx`, `wifi-plans-table.tsx`, `app/dashboard/wifi/plans/page.tsx` | Plans tab UI |
| `apps/web/src/hooks/use-wifi.ts` | plan mutations + invalidation |

## Contracts

| Contract | Change? | Notes |
| -------- | ------- | ----- |
| API routes | yes | `POST /wifi/plans`, `PATCH /wifi/plans/:id`, `GET /wifi/plans?includeInactive` |
| DB schema | yes | `wifi_plan` table + seed migration 0008 |
| Env vars | no | `WIFI_PROFILE_*` become the fallback path only (kept, still optional) |
| Package exports | no | |
| UI tokens | no | |
| Agent memory | yes | ROADMAP_AI.md + spec marked implemented |

## Pseudocode

```text
1. wifi_plan table: text PK id (slug), name, description, priceKobo,
   rosProfile, dataLimitBytes?, uptimeLimit?, validityLabel, active, sortOrder.
2. Migration 0008: CREATE TABLE + seed 6 plans with production profiles.
3. Repo: listPlans({includeInactive}), createPlan, updatePlan — map rows to
   the WifiPlan domain shape, active-first… no, sortOrder asc.
4. Console router: GET /plans → repo.listPlans(); POST/PATCH with zod.
5. wifi-router.ts: findPlan(await repo.listPlans(), planId).
6. Server deps.plans → plans: () => Promise<readonly WifiPlan[]>; bootstrap
   builds loadPlans with DB + fallback; tests updated.
7. Web: /buy queries wifi_plan (fallback buildPlans()); Plans tab UI.
```

## Validation Plan

- [x] `pnpm turbo run build --filter=@turbo/api`
- [x] `pnpm -F @turbo/api test`
- [x] `pnpm -F web typecheck`
- [x] `pnpm ai:contracts`
- [x] `pnpm design:lint && pnpm design:tokens && pnpm ui:composition`

## Rollback Plan

Revert the commit; the old code paths (`resolvePlans()` / `buildPlans()`) remain
the documented fallback, so a revert needs no data fix (the table is inert).

## Notes

- Orders snapshot planId + amountKobo and batches snapshot profile already, so
  editing/deactivating a plan never rewrites history.
- `bonusPlan` (trial-5m) stays hardcoded and non-purchasable.
- After deploy the `WIFI_PROFILE_*` env vars are obsolete (the DB rows own the
  profile names); they can be cleared later.
