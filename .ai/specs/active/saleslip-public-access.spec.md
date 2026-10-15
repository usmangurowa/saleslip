# Feature Spec: Saleslip public access (landing, checkout, admin security)

## Status

- State: proposed
- Owner: AI agent
- Created: 2026-09-23
- Updated: 2026-09-23

## Problem

`saleslip.app` still serves the generic Turbo starter landing page and does not
say "Saleslip". Customers must buy WiFi vouchers without creating an account,
the whole purchase → payment → activated-voucher journey has to live on
`saleslip.app`, and only the operator may see revenue, customer phone numbers,
vouchers, and live-device controls. Today any verified registered user is
treated the same as an administrator, Paystack is disabled in production, and
the plan catalogue contains three obsolete plans.

## Acceptance Criteria

### Public site (Next.js, `saleslip.app`)

- [ ] The landing page is Saleslip-branded: one-line value proposition and six
      plan cards. Every Turbo reference and `turbo.app` metadata is removed.
- [ ] `/buy?plan=<id>` renders the chosen plan, a Nigerian phone field, an
      optional email field, and no requirement to sign up or log in.
- [ ] `/receipt/[orderId]` shows a pending state, then the activated voucher
      code + QR (polling), or a clear failure state with the support number.
- [ ] "Admin login" remains reachable from the footer/navigation, but public
      signup is no longer promoted in the customer journey.

### Plans (source of truth: `packages/wifi/src/plans.ts`)

- [ ] The market ladder — ₦50 entry tier plus the three unlimited plans —
      replaces the obsolete ₦1,000–₦8,000 catalogue:

  | Plan | ID | Price | Data | Validity | RouterOS profile |
  |---|---|---|---|---|---|
  | 1 Day, 1 GB | `pos-1` | ₦50 | 1 GB (per-voucher byte cap) | 24 hours | `1-Day-1GB` |
  | 1 Day, 1 device | `day-1` | ₦500 | Unlimited | 24 hours | `1-Day-Unlimited` |
  | 1 Week, 1 device | `week-1` | ₦2,000 | Unlimited | 7 days | `1-Week-Unlimited` |
  | 1 Month, 1 device | `month-1` | ₦5,000 | Unlimited | 30 days | `1-Month-Unlimited` |

- [ ] The retired duo plans (`day-2`, `week-2`, `month-2`) stay in the seed
      and the table as `active = false` so vouchers already sold on their
      profiles still resolve; buyer-facing lists filter them out. Their
      profiles (`Duo-1-Day`, `Duo-1-Week`, `Duo-1-Month`) stay on the router
      for legacy vouchers.

- [ ] Validity counts from **first login**, enforced by each profile's on-login
      script; the device limit is the profile's `shared-users` (1). The four
      sellable profiles above must exist on the router (one-time manual task);
      `1-Day-1GB` carries the 24-hour expiry stamp, the 5M/3M rate limit, and
      the ₦50 price in its on-login voucher metadata. The `pos-1` byte cap is
      enforced per voucher at minting (`limit-bytes-total`), not by the
      profile.

### Checkout and payment (reusing the existing engine)

- [ ] The order is created and a Paystack transaction initialized through the
      existing `startCheckout`, reached from a same-origin Next.js route that
      forwards to `api.saleslip.app` (the standalone runtime keeps Paystack and
      RouterOS responsibilities because only it has WireGuard connectivity).
- [ ] Paystack's signed webhook remains the only trusted fulfilment path; the
      browser redirect is never trusted to mark an order paid.
- [ ] The already-implemented pending → paid → fulfilled and `pending_router`
      retry flows are reused, not reimplemented.

### Administrator security

- [ ] New `ADMIN_EMAILS` environment variable; seeded with
      `usmanhassangu@gmail.com`.
- [ ] Account creation is restricted to allowlisted emails (the allowlist is the
      authoritative check, not the hidden link).
- [ ] Authenticated but non-admin users cannot reach WiFi dashboard pages and
      get a clear "no access" state.
- [ ] Both database-backed (`/wifi`) and RouterOS-backed (`/wifi-router`) APIs
      enforce the same check: 401 when unauthenticated, 403 for authenticated
      non-admins.
- [ ] Public-registration promotion and "Continue with GitHub" are removed from
      the customer journey.

### Error states

- [ ] Paystack disabled/unreachable renders "Payments temporarily unavailable"
      with the support number.
- [ ] Router offline does not block payment; fulfilment retries on reconnect via
      the existing `pending_router` backoff.

## Expected Files

| File | Expected change |
| --- | --- |
| `apps/web/src/app/page.tsx` | Saleslip landing with six plan cards |
| `apps/web/src/components/landing/**` | Saleslip navigation and hero |
| `apps/web/src/app/layout.tsx` | Saleslip metadata; drop `turbo.app` |
| `apps/web/src/app/buy/**`, `apps/web/src/app/receipt/**` | Customer checkout and receipt UI |
| `apps/web/src/app/api/shop/**` (or equivalent) | Same-origin order forwarder |
| `apps/web/src/app/api/wifi-router/[...path]/route.ts` | Add admin guard on the proxy |
| `apps/web/src/app/dashboard/layout.tsx` | Admin rejection/redirect |
| `apps/web/src/components/auth/signup-form.tsx` | Allowlist-gated signup, drop GitHub |
| `packages/wifi/src/plans.ts` | Six approved plans |
| `packages/api/src/middleware/auth.ts` | Admin allowlist helper/augmentation |
| `packages/api/src/router/wifi.ts`, `router/wifi-router.ts` | Admin-only guards |
| `apps/server/src/env.ts` | `ADMIN_EMAILS` |
| `.agents/product-marketing.md` | Auto-drafted Saleslip positioning |
| `.env.example`, `README.md`, `ROADMAP_AI.md` | Env contract and ledger |

## Contracts

| Contract | Change? | Notes |
| --- | --- | --- |
| API routes | yes | New same-origin web orders proxy; admin-only WiFi routes |
| DB schema | no | No new migration needed for allowlist or six plans |
| Env vars | yes | `ADMIN_EMAILS`; plan profiles stay env-overridable |
| Package exports | yes | Only if a new client is added; reuse existing otherwise |
| UI tokens | yes | Runtime token changes must update `DESIGN.md` |
| Agent memory | yes | `ARCHITECTURE.md`, `ROADMAP_AI.md`, product-marketing |

## Pseudocode

```text
landing            -> six plan cards -> "Buy now" -> /buy?plan=<id>
POST /api/shop/orders  -> forward JSON to api.saleslip.app /orders (reuse shop route)
startCheckout      -> createOrder + Paystack initialize -> redirect to authorization_url
POST /webhooks/paystack -> verify HMAC -> charge.success -> fulfil(order) (unchanged)
fulfil             -> create RouterOS hotspot user + voucher -> markFulfilled (unchanged)
GET /receipt/[id]  -> poll order status until fulfilled/failed -> show code + QR
authorization      -> isAdmin(session) = session.user.email ∈ ADMIN_EMAILS
signup             -> reject email not in ADMIN_EMAILS (authoritative check)
dashboard layout   -> redirect/reject non-admin; APIs 401/403
```

## Validation Plan

- [x] (to run) Reconcile the diverged feature branch with `origin/main` first.
- [ ] TDD per vertical slice: plans, admin guard, signup allowlist, checkout route.
- [ ] `pnpm design:lint`, `pnpm design:tokens`, `pnpm ui:composition`.
- [ ] `pnpm ai:contracts` and `pnpm run ci`.
- [ ] Manual: Paystack test-mode purchase end to end, then a real order.
- [ ] Manual: `10.8.0.2:8728` reachable before live fulfilment.

## Rollback Plan

Each concern reverses independently: restore the previous plan catalogue by
reverting `packages/wifi/src/plans.ts`; remove `ADMIN_EMAILS` entries to reopen
signup; set `PAYSTACK_DISABLED=1` to stop new checkouts. The new landing and
checkout pages are additive and can be routed back to the prior pages by
reverting the changed `app` route files. No schema migration ships.

## Notes

- The standalone runtime keeps Paystack webhooks and RouterOS fulfilment; the
  web app only owns the public storefront and forwards orders to it.
- The environment email allowlist is the launch authorization model; a database
  role is a later enhancement covered in `docs/wifi-platform-plan.md`.
- RouterOS profile provisioning for the six duration/device combinations is a
  manual router step before live sales, matching the names above.
- Product-marketing context is auto-drafted from this spec and the codebase; it
  is unblocked by, and does not delay, the urgent launch scope.