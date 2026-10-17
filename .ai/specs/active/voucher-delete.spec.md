# Spec: Voucher deletion (state-aware, fail-closed)

State: implemented

## Bulk deletion (added 2026-10-17)

`POST /api/wifi-router/vouchers/bulk-delete` `{ ids: string[] }` (1–200) settles
every voucher independently through the same rulebook (`settleVoucherDeletion`,
shared with the single route so they cannot drift) and reports per-item
outcomes: `deleted` (with `revokedRouterUser`), `blocked-awaiting-fulfilment`,
`skipped-router-unreachable`, `not-found`. Partial success by design — a dead
router skips active vouchers but still deletes revoked history. The dashboard
vouchers table gained checkbox selection (page select-all, cleared on page and
filter changes) and a confirmed "Delete N selected" action whose toast reports
the summary.

## UI simplification (same day)

The separate Revoke button is gone — the single state-aware Delete covers both
cases (live → revoke+delete, dead → delete-only), so the Action column carries
one button. The `/revoke` endpoint remains part of the API surface for
programmatic use.

## Problem

The console can mint and revoke vouchers but never remove rows: the
`wifi_voucher` table grows forever, and revoked/expired history cannot be
cleaned up. Deleting must never orphan a live credential (a working code
invisible to the console) and never eat a paid sale still in flight.

## Semantics

`DELETE /api/wifi-router/vouchers/:id` (admin only, on the router-backed app):

| Voucher state | Behaviour |
| --- | --- |
| unknown id | `404` |
| `active` and its order is `paid` or `pending_router` | `409` — the code is in flight; the retry sweep owns it (deleting the row would re-mint a different code) |
| `active` and a hotspot user for the code exists on the router | remove the router user first (fail-closed: router down → `503`, nothing deleted), then delete the row → `{ deleted: true, revokedRouterUser: true }` |
| `active` and no router user (e.g. expired and cleaned by Mikhmon, or never activated) | delete the row only → `{ deleted: true, revokedRouterUser: false }` |
| `revoked` | delete the row only — revoke already removed the router user; no router needed |

The router is the source of truth for live credentials: codes can outlive their
`rosId` (manual activation era) or die before it (Mikhmon deletes expired
users), so `active` rows always ask the router by code, not by `rosId`.

## Acceptance criteria

- [x] Revoked voucher deletes with no router call.
- [x] Active voucher with a live router user: user removed before row delete.
- [x] Active voucher with no router user: row deleted, `revokedRouterUser: false`.
- [x] Order-owned voucher awaiting fulfilment: `409`, row untouched.
- [x] Router unreachable: `503`, row untouched (fail-closed).
- [x] Unknown id: `404`.
- [x] Dashboard: Delete action (with confirm dialog) on active and revoked rows.

## Expected files

- `packages/api/src/wifi/repository.ts` — `findVoucherWithOrder`, `deleteVoucher`
- `packages/api/src/router/wifi-router.ts` — DELETE route
- `packages/api/src/__tests__/wifi-router.test.ts` — the cases above
- `apps/web/src/hooks/use-wifi-router.ts` — `useDeleteVoucher`
- `apps/web/src/components/dashboard/wifi/wifi-vouchers-table.tsx` — Delete button

## Contracts affected

- `WifiConsoleRepository` gains two methods (additive).
- `/api/wifi-router/vouchers/:id` gains DELETE (additive; typed client picks it
  up automatically). Run `pnpm ai:contracts` after landing.

## Validation

```bash
pnpm turbo run test --filter=@turbo/api
pnpm turbo run typecheck
pnpm design:lint && pnpm design:tokens && pnpm ui:composition
```
