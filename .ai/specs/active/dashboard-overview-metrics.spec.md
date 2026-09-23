# Feature Spec: Dashboard overview shows real hotspot metrics

## Status

- State: implemented
- Owner: AI agent
- Created: 2026-09-23
- Updated: 2026-09-24

## Problem

`/dashboard` (the Overview route) still renders the shadcn dashboard template:
task tables, fake integrations, and placeholder stat cards that point at the
template task API. An operator opening the dashboard learns nothing about the
hotspot business. Meanwhile the sidebar advertises sections (Tasks, Inbox,
Customers, Prompt Library, Trends, Reports) that render "Build X here"
placeholders.

The overview should answer the two questions an operator asks first: how is
the business doing right now (vouchers generated, revenue today, connected
users), and who is connected right now (code, plan, customer, how much they
paid).

## Acceptance Criteria

- [x] Overview shows four hero metric cards: connected users right now,
      revenue collected today, vouchers generated (all-time, with today's
      delta), and active vouchers.
- [x] The connected-users card degrades to "—" with a "router unreachable"
      note when `apps/server` cannot reach the hotspot, instead of erroring.
- [x] The overview table lists currently connected customers with their plan,
      customer identity, and how much they paid; unknown/counter rows render
      "—"/counter wording, not a crash.
- [x] `GET /api/wifi/stats` additionally reports voucher generation counts
      (`generated: { total, today }`) — additive, existing consumers keep
      working.
- [x] `GET /api/wifi-router/sessions` additionally reports each session's
      `amountKobo` (null for counter/batch vouchers) — additive.
- [x] The sidebar only lists sections that exist: Overview, WiFi, Assistant,
      Settings. Placeholder nav entries are removed.
- [x] The template components the old overview used (`stat-cards`,
      `tasks-table`, `tasks-toolbar`, `integrations`) are deleted.

## Expected Files

| File                                                        | Expected change                                          |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `packages/api/src/wifi/repository.ts`                       | `amountKobo` on `SessionVoucher`; `voucherGenerationSummary` method |
| `packages/api/src/router/wifi.ts`                           | `/stats` response gains `generated`                       |
| `packages/api/src/router/wifi-router.ts`                    | `/sessions` rows gain `amountKobo`                        |
| `apps/web/src/components/dashboard/overview-stat-row.tsx`   | new: four metric cards for the overview                   |
| `apps/web/src/components/dashboard/overview-view.tsx`       | rewritten: stat row + live sessions table                 |
| `apps/web/src/components/dashboard/wifi/wifi-sessions-table.tsx` | new "Paid" column (shared with the WiFi console)     |
| `apps/web/src/components/dashboard/nav-config.ts`           | placeholder sections pruned                               |
| `apps/web/src/components/dashboard/{stat-cards,tasks-table,tasks-toolbar,integrations}.tsx` | deleted                       |
| `packages/api/src/__tests__/wifi-router.test.ts`            | sessions test asserts `amountKobo` passthrough            |

## Contracts

| Contract        | Change?     | Notes                                              |
| --------------- | ----------- | -------------------------------------------------- |
| API routes      | additive    | `/stats` gains `generated`; `/sessions` rows gain `amountKobo`; regenerate snapshots |
| DB schema       | no          | reads only                                         |
| Env vars        | no          |                                                    |
| Package exports | no          |                                                    |
| UI tokens       | no          |                                                    |
| Agent memory    | yes         | ROADMAP_AI.md ledger row                           |

## Pseudocode

```text
1. Repository: add amountKobo to SessionVoucher select; add generation counts.
2. Routes: pass both through, additive.
3. Web: Paid column on sessions table; new overview stat row; rewrite view.
4. Nav: drop placeholder sections; delete orphaned template components.
5. Validate: targeted vitest, design scripts, contracts, typecheck.
```

## Validation Plan

- [x] `pnpm vitest run --root packages/api`
- [x] `pnpm vitest run --root apps/web`
- [x] `pnpm design:lint && pnpm design:tokens && pnpm ui:composition`
- [x] `pnpm ai:contracts`
- [x] Typecheck touched packages

## Rollback Plan

Single revert; API changes are additive reads, no schema or data migration.
