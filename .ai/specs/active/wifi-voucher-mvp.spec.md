# Feature Spec: WiFi voucher sales MVP (Saleslip)

## Status

- State: implemented
- Owner: AI agent
- Created: 2026-09-12
- Updated: 2026-09-22

## Problem

Saleslip runs a Starlink hotspot on a MikroTik hEX (RouterOS 7.19.6) and sells
WiFi access by hand through Mikhmon. Customers need a way to pick a plan, pay
with Paystack (bank transfer, USSD, card) and get a working hotspot code
without an operator, from the captive portal or from Telegram. The long-term
multi-tenant plan is `docs/wifi-platform-plan.md`; this spec is the single-tenant
slice that ships first.

## Acceptance Criteria

- [x] `GET /` lists plans; `POST /orders` creates an order and redirects to Paystack.
- [x] `mac`, `ip`, `login` from the captive portal survive to the receipt page.
- [x] Paystack webhook verifies `x-paystack-signature`, is idempotent by reference,
      and is the only path that fulfils. `GET /webhooks/paystack/verify/:reference`
      exists for manual recovery.
- [x] Fulfilment generates a unique `SL#####` code, creates the hotspot user
      referencing the plan's existing RouterOS profile (no expiry logic of our own),
      stores a voucher, marks the order fulfilled, and DMs Telegram orders.
- [x] Router failure parks the order in `pending_router` and retries with backoff.
- [x] `GET /orders/:id` polls until fulfilled, shows the code, QR, plan, price, time,
      support phone, and a Connect now form that POSTs to the MikroTik login URL.
- [x] Telegram bot: `/start` menu, Buy → plan → phone → Paystack link, My vouchers,
      Help, owner-only `/status`, router-down alert after 5 minutes.
- [x] `GET /health` reports database and router reachability.
- [x] Dockerfile adds the WireGuard route as root and drops to `node`; a Coolify
      compose snippet and README section document deployment.
- [x] Router-only API exports use dedicated server and browser-client subpaths,
      so the Next.js production bundle never pulls in `node-routeros`.
- [x] The same-origin WiFi proxy is compatible with Next.js Cache Components.
- [x] Vitest covers code generation, signature verification, order state, plan
      mapping, fulfilment, routes, Telegram and the watchdog.

## Expected Files

| File                                             | Expected change                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `packages/routeros/*`                            | New `@turbo/routeros`: transport + hotspot service over node-routeros   |
| `packages/paystack/*`                            | New `@turbo/paystack`: initialize/verify client, signature, event parse |
| `packages/db/src/wifi-schema.ts`                 | `wifi_order`, `wifi_voucher` tables + enums                             |
| `packages/db/drizzle/0003_*.sql`                 | Migration                                                               |
| `apps/server/src/wifi/**`                        | Shop, webhook, fulfilment, receipt, Telegram bot, watchdog, health      |
| `apps/server/src/env.ts`                         | Router, Paystack, Telegram, branding variables                          |
| `apps/server/Dockerfile`, `docker-entrypoint.sh` | iproute2 + su-exec, WireGuard route on boot                             |
| `packages/api/package.json`                      | Browser-safe and server-only WiFi router subpath exports                |
| `apps/web/src/app/api/wifi-router/**`            | Same-origin RouterOS proxy compatible with Cache Components             |
| `deploy/coolify-compose.snippet.yaml`            | Service block for the `saleslip-wifi` stack                             |
| `README.md`, `.env.example`, `turbo.json`        | Docs and env contract                                                   |

## Contracts

| Contract        | Change? | Notes                                                                     |
| --------------- | ------- | ------------------------------------------------------------------------- |
| API routes      | yes     | Server-hosted shop routes (not `packages/api`; see Notes)                 |
| DB schema       | yes     | `wifi_order`, `wifi_voucher`                                              |
| Env vars        | yes     | `ROUTER_*`, `PAYSTACK_*`, `TELEGRAM_*`, `WIFI_PROFILE_*`, branding        |
| Package exports | yes     | `@turbo/routeros`, `@turbo/paystack`, `@turbo/api/wifi-router*`           |
| UI tokens       | no      | Server-rendered HTML with Tailwind CDN; not part of the web design system |
| Agent memory    | yes     | `ARCHITECTURE.md`, `ROADMAP_AI.md`, `.ai/context/tech-stack.md`           |

## Pseudocode

```text
POST /orders            -> startCheckout: insert order, Paystack initialize, 303 to authorization_url
POST /webhooks/paystack -> verify HMAC -> charge.success -> markPaid -> fulfil(order)
fulfil                  -> code = SL + 5 digits (unique) -> hotspot.createHotspotUser
                        -> insert voucher -> markFulfilled -> telegram DM if channel=telegram
                        -> on RouterOsUnavailable: pending_router, schedule retry (backoff)
GET /orders/:id         -> render receipt; client polls JSON until fulfilled
Telegram                -> grammY webhook; buy flow reuses startCheckout with channel=telegram
Watchdog                -> systemResource() every 60s; alert admins after 5 min down
```

## Validation Plan

- [x] `pnpm --filter @turbo/routeros test`, `pnpm --filter @turbo/paystack test`
- [x] `apps/server`: `pnpm typecheck && pnpm lint && pnpm test`
- [x] `pnpm docker:check`, `pnpm ai:contracts`
- [x] `pnpm run ci`
- [ ] From the deployed container: `pnpm --filter @turbo/server routeros:check`
- [ ] Paystack test-mode purchase end to end, then a real ₦500 order

## Rollback Plan

Unset `PAYSTACK_SECRET_KEY` (or set `PAYSTACK_DISABLED=1`) to stop new
checkouts; the shop renders but `POST /orders` returns 503. Remove the
`saleslip-server` block from the Coolify stack to take the service down. The
tables are additive; drop `wifi_voucher` then `wifi_order` if a full revert is
needed. Vouchers already created on the router stay valid.

## Notes

- Shop routes live in `apps/server/src/wifi` rather than `packages/api` because
  they are server-rendered HTML for one runtime and the SaaS version will be a
  redesign (plan §12). The reusable parts are the provider packages.
- RouterOS is only reachable from the VPS over WireGuard; local tests use a fake
  hotspot service. Manual integration check is part of deployment.
- No Redis: retries are in-process timers plus a boot sweep. Acceptable for one
  tenant; revisit with `packages/jobs` when volume warrants it.
