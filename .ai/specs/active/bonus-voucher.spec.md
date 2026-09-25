# Feature Spec: Post-purchase bonus 5-minute voucher

## Status

- State: superseded (retired)
- Owner: AI agent
- Created: 2026-01-30
- Updated: 2026-02-06

## Superseded

The bonus voucher was removed (`feat/remove-bonus-voucher`). The daily
RouterOS trial already gives any offline customer 5 free minutes to get
back online and repurchase, so minting a bonus voucher with every purchase
was redundant. The `bonus` voucher kind remains in `WIFI_VOUCHER_KINDS`
for historical rows; nothing mints or displays it anymore.

## Problem

When a customer's data runs out they are offline and cannot reach the shop to
buy again. The captive portal hands them a one-time free 5-minute trial, but a
returning customer who already used their trial (or came from a device where
the trial is unavailable) is stuck until they find another way online.

Every paid order should therefore mint a second, single-use ~5-minute voucher
alongside the paid one, shown on the receipt with copy explaining what it is
for: "Save this code — when your data finishes, use it for 5 free minutes to
buy again."

## Acceptance Criteria

- [ ] `wifi_voucher` gains a `kind` column (`primary` | `bonus`, default
      `primary`); migration ships in the same PR and applies on server boot.
- [ ] Fulfilting a paid order creates TWO RouterOS hotspot users: the paid plan
      voucher and a bonus voucher on the `trial-5m` profile with
      `limit-uptime=5m` (single device, shared-users stays in the profile).
- [ ] Both creations are idempotent across retries (rosId / find-first dedupe,
      same as the paid voucher).
- [ ] The order only transitions to `fulfilled` after BOTH hotspot users exist.
- [ ] Bonus voucher ROS comment is distinguishable:
      `saleslip|bonus:<orderId>|<phone>`.
- [ ] `GET /orders/:id` JSON gains `bonusVoucherCode`; the server-rendered
      receipt shows a bonus block with a copy button and no connect form.
- [ ] The web app receipt (`/receipt/[orderId]`) shows the bonus code with a
      copy button and the save-it copy.
- [ ] Telegram `onFulfilled` message (when enabled) includes the bonus code.
- [ ] Admin console voucher lists keep working (bonus rows are ordinary
      vouchers); `getVoucherForOrder` keeps returning the paid voucher only.

## Expected Files

| File | Expected change |
| --- | --- |
| `packages/db/src/wifi-schema.ts` | add `kind` enum column |
| `packages/db/drizzle/0006_*.sql` | generated migration |
| `packages/wifi/src/plans.ts` | export non-purchasable `bonusPlan` (profile `trial-5m`, uptime `5m`) |
| `apps/server/src/wifi/orders.ts` | kind-aware `createVoucher` / `getVoucherForOrder`; add `getBonusVoucherForOrder` |
| `apps/server/src/wifi/fulfilment.ts` | mint both vouchers idempotently; fulfilled only after both |
| `apps/server/src/wifi/routes/shop.ts` | expose `bonusVoucherCode` in JSON + receipt props |
| `apps/server/src/wifi/pages/receipt.ts` | bonus block + copy buttons |
| `apps/web/src/hooks/use-shop-order.ts` | add `bonusVoucherCode` |
| `apps/web/src/components/shop/receipt.tsx` | bonus code display + copy |
| `apps/server/src/wifi/bootstrap.ts` | telegram message mentions bonus code |
| `apps/server/src/wifi/__tests__/*` | extend for two-voucher fulfilment |

## Contracts

| Contract | Change? | Notes |
| --- | --- | --- |
| API routes | yes | `GET /orders/:id` JSON adds `bonusVoucherCode` |
| DB schema | yes | `wifi_voucher.kind` + migration 0006 |
| Env vars | no | bonus profile is the router's existing `trial-5m` |
| Package exports | yes | `@turbo/wifi` exports `bonusPlan` |
| UI tokens | no | composes existing primitives |
| Agent memory | no | follows existing wifi module patterns |

## Pseudocode

```text
fulfil(order):
  plan = findPlan(order.planId)            # unchanged
  primary = ensureVoucher(order, plan, "primary")
  bonus   = ensureVoucher(order, bonusPlan, "bonus")
  if no hotspot: park pending_router        # unchanged
  ensureHotspotUser(primary, plan, owner=order.id)
  ensureHotspotUser(bonus, bonusPlan, owner="bonus:"+order.id)
  transition(fulfilled); onFulfilled(...)
```

## Open Questions

- Reuses the router's existing `trial-5m` profile (created with the captive
  portal work) — no router-side change required.
- Bonus vouchers appear in admin console voucher lists; acceptable, they are
  real vouchers.
