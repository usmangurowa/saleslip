# Spec: Attendance board (persistent live sessions)

State: implemented

## Problem

The Live tab only ever showed *currently connected* sessions, so people
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

## Validation

```bash
pnpm turbo run test --filter=@turbo/routeros --filter=@turbo/wifi --filter=@turbo/api
pnpm run ci
```
