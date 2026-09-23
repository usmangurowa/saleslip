# Spec: Captive-portal plan preselect, optional contact fields, voucher email

- **Status:** in progress
- **Branch:** `usmangurowa-wifi-voucher-mvp`
- **Date:** 2026-09-24
- **Requesting sessions:** `7fe712b3-db91-4bc6-9c36-a4c448ffb7f3` (captive-portal owner briefs)

## Problem

The MikroTik captive portal now links directly to plan-specific buy URLs
(`/api/shop?planId=day-1`), but the server-rendered buy page ignores the
parameter and always preselects the first plan. Buyers are also forced to
enter a phone number even though we have no SMS capability, and the voucher
code is only visible on the receipt page — nothing is emailed.

## Goals

1. **Plan preselect (P0).** The server buy page honors `?planId=<plan-id>`:
   when it matches a known plan, that radio is preselected; unknown or absent
   values fall back to the first plan. The web `/buy` page accepts `planId`
   as an alias for its existing `plan` search param.
2. **Optional, email-first contact fields.** Phone and email are both
   optional on every channel (server form + web form). Email is listed first
   and positioned as the voucher delivery channel. A present-but-invalid
   phone still fails validation with the same message. `wifi_order.phone`
   becomes nullable (migration `0007`). Paystack requires an email, so
   checkout falls back to `<orderId>@buyers.saleslip.app` when the buyer
   leaves both fields empty.
3. **Voucher receipt email (required when email present).** On fulfilment,
   if the order has an email, send one receipt-style email via the existing
   Resend sender containing: plan name, price, duration, device count, the
   voucher code (prominent), the bonus 5-minute code when present, and a
   short "how to use" section. Subject: `Your Saleslip voucher is ready`.
   Template is text-first so it renders on captive-portal devices. No email
   → skip silently (receipt page remains the delivery channel). Telegram
   notify continues to work; each channel is guarded so one failing never
   blocks the other. The hook only fires on the `fulfilled` transition, so
   parked orders email on later retry success and there are no duplicates.

## Non-goals

- SMS delivery of voucher codes.
- Changing the receipt page content beyond hiding an absent phone row.
- Captive-portal auto-connect behavior (unchanged).

## Implementation

| Area | Change |
| --- | --- |
| `packages/db` | Migration `0007_wifi_order_phone_optional.sql` drops `NOT NULL` from `wifi_order.phone`; schema drops `.notNull()`. |
| `packages/validators` | New `optionalNigerianPhoneSchema` (empty → absent, present → validated/normalized); `buyOrderSchema.phone` uses it. |
| `apps/server/src/wifi/routes/shop.ts` | `portalParamsSchema` gains `planId`; `orderFormSchema.phone` optional. |
| `apps/server/src/wifi/pages/buy.ts` | `PortalParams.planId`; preselect logic; email-first optional fields. |
| `apps/server/src/wifi/checkout.ts` | Paystack email fallback chain: real email → phone-derived → `<orderId>@buyers.saleslip.app`. |
| `apps/server/src/wifi/orders.ts` | `phone: string \| null` on record; `phone?: string` on input. |
| `apps/server/src/wifi/pages/receipt.ts` | Phone row rendered only when present. |
| `apps/server/src/wifi/fulfilment.ts` | `phone: order.phone ?? undefined` into `toHotspotUserInput`. |
| `packages/mail` | New `VoucherEmail` template + index export. |
| `apps/server/src/wifi/voucher-email.ts` | `sendVoucherEmail` helper (createElement, no JSX in server). |
| `apps/server/src/wifi/bootstrap.ts` | `onFulfilled` gains guarded email branch alongside telegram. |
| `apps/web` | `buy-form.tsx` email-first optional fields; `/buy` accepts `planId` alias. |

## Tests

- No phone + no email → order created; Paystack email is
  `<orderId>@buyers.saleslip.app`.
- Bad phone when present → still 400 with the existing message.
- `?planId=week-1` preselects that radio; unknown id falls back to first plan.
- Existing 38 wifi tests stay green.

## Rollout

Merge → both Coolify deploys (migrations auto-apply on server boot) → live
verify `/api/health` + `?planId=day-1` on the buy page → notify requesting
session.
