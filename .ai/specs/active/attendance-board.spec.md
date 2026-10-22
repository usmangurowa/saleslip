# Spec: Attendance board (persistent live sessions)

State: implemented

## Problem

The Live tab only ever showed _currently connected_ sessions, so people
vanished the moment they disconnected, and a dead router killed the whole
table with a 503. Operators need to see everyone who has connected — with a
health colour that survives disconnects and router outages.

## Semantics

`GET /api/wifi-router/sessions?limit=&offset=` returns the **attendance
board**: every voucher with `activated_at` set (paginated, newest activation
first), overlaid with live router state. Decisions confirmed with the owner:

- **Scope:** everything, paginated (no time cut).
- **Row anchors are vouchers**, not sessions — a row survives disconnects.
  Foreign hotspot users (no voucher — Mikhmon-minted, manual) appear only
  while connected, appended after the page's rows.
- **Indicators**, precedence red > yellow > green; disconnected is black:
  - 🟢 green — connected, healthy.
  - 🟡 yellow — free trial (`trial-5m` profile) or **under 60 minutes left**
    on the session (`session-time-left`).
  - 🔴 red — **WAN heartbeat failed** (server asks the router to ping
    1.1.1.1 each poll — Starlink down = everyone red) or a session with
    5+ minutes uptime and under 1 MB of traffic.
  - ⚫ black — disconnected.
- **Router down or unconfigured:** HTTP 200 with `routerReachable: false`,
  every row black/disconnected, `connected: 0` — the board degrades, never
  errors. (`/sessions` left the 503-on-no-router set.)

## Acceptance criteria

- [x] Connected + healthy → green; disconnected voucher → black, stays on the board.
- [x] Under 60 min left → yellow with "Expires in N min"; trial profile → yellow "Free trial".
- [x] WAN heartbeat failure → every connected row red.
- [x] 5+ min uptime with < 1 MB traffic → red "Connected but barely moving data".
- [x] Router unreachable / not configured → 200, all black, board intact.
- [x] Foreign users appended while connected, `known: false`.
- [x] Pagination by limit/offset (limit clamped 1–200).
- [x] Overview "Connected now" card reads the new payload and degrades on `routerReachable`.

## Expected files

- `packages/routeros/src/{types,hotspot}.ts` — `sessionTimeLeft` on sessions, `wanReachable()`
- `packages/wifi/src/format.ts` — `parseRosDurationMs`
- `packages/api/src/wifi/repository.ts` — `listActivatedVouchers`
- `packages/api/src/router/wifi-router.ts` — board endpoint + `connectedIndicator`
- `apps/web/src/hooks/use-wifi-router.ts`, `overview-stat-row.tsx`, `wifi/wifi-sessions-table.tsx`

## Correction (2026-10-18): the board shows _used_ vouchers only

The first cut anchored rows on `activated_at` — but saleslip stamps that at
minting, so every unused counter code cluttered the board as a black row. Per
owner decision, the board now lists only vouchers a customer has actually
**used**, detected as `bytes_used > 0 OR last_connected_at IS NOT NULL`:

- `wifi_voucher.last_connected_at` (migration 0014) is stamped whenever a code
  appears in an active session — by the board poll (write-behind) and by a new
  always-on **connection recorder** in `apps/server` (every minute: stamps
  connected codes + snapshots every hotspot user's byte counters, so "data
  used" stays fresh and used codes are never mistaken for unused, even when
  nobody has the dashboard open).
- Rows are ordered by last activity (last connected, falling back to
  activation); the table's Connected column becomes **Online / Last seen**
  (uptime while connected, "3h ago" when disconnected).

Historical vouchers whose router users Mikhmon already deleted can't be
reconstructed — they appear from now on as usage records accumulate.

## Addition (2026-10-22): "New" badge

A customer who just bought a code and connected is flagged **New** next to
the code for an hour after their first connection, so staff can spot fresh
customers on the board.

- `wifi_voucher.first_connected_at` (migration 0016) is stamped by the same
  writers as `last_connected_at` but only once (`coalesce`). The migration
  backfills already-used codes from their earliest known time so returning
  customers are not flagged after deploy.
- `/sessions` rows carry `firstConnectedAt` and a server-computed `isNew`
  (first connection under 60 minutes ago by the injected clock). Foreign
  hotspot users are never new.

## Validation

```bash
pnpm turbo run test --filter=@turbo/routeros --filter=@turbo/wifi --filter=@turbo/api
pnpm run ci
```
