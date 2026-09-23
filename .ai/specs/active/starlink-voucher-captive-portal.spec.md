# Feature Spec: Starlink/MikroTik Voucher Captive Portal

## Status

- State: implemented
- Owner: AI agent
- Created: 2026-09-22
- Updated: 2026-09-22

## Problem

The MikroTik hotspot in front of the Starlink link uses the router's default
captive-portal page. We need a branded, minimal replacement: a single voucher
code field (the voucher doubles as both username and password), styled to match
the Saleslip web app's shadcn-based design system.

The portal page must load on client devices **before** authentication, so the
deployable artifact is a self-contained static `login.html` served by the
router. The web app additionally hosts a React design-reference page at
`/portal` so the design lives in the codebase and can be previewed.

## Acceptance Criteria

- [x] `/portal` route in `apps/web` renders the voucher page using existing
      shadcn house components, matching the `(auth)` visual precedent
      (centered `max-w-sm`, blurred corner accents, Saleslip logo header).
- [x] The form shows exactly one input (voucher code) and one submit button;
      empty or whitespace-only input shows an inline `FieldError`.
- [x] `apps/web/public/mikrotik/login.html` is fully self-contained: inline
      CSS, inline SVG logo, system font stack, **no external requests** (no
      web fonts, no CDNs).
- [x] `login.html` keeps MikroTik stock hotspot mechanics: `sendin` form
      posting to `$(link-login-only)`, hidden `dst` (`$(link-orig)`) and
      `popup` fields, `doLogin()` CHAP handling with `/md5.js`, plain PAP
      fallback.
- [x] On submit, the voucher value is submitted as both `username` and
      `password` (MD5-hashed for CHAP).
- [x] Hardened form (2025): the visible voucher input **is** the form's
      `name="username"` field (hidden `password` is filled by JS). If the
      inline script never runs (cache/parse/timing), a native submit still
      sends `username=<voucher>` — a visible, logged auth failure, never a
      silent empty-credential POST.
- [x] Substitution safety: `$(...)` placeholders appear only in HTML
      attributes; the inline `<script>` contains none. CHAP material is
      read from hidden inputs `#chap-id` / `#chap-challenge` in the
      `sendin` form; `$(error)` renders only via the `$(if error)` HTML
      block. Pinned by the "keeps substitutions out of fragile JS logic"
      test.
- [x] Hotspot profile `hsprof4` login-by is `cookie,http-chap,http-pap` —
      `http-pap` accepts the JS-less native fallback POST.
- [x] ES3-safe script (2025): no ES5+ syntax — no `.trim()` (regex replace
      instead), no `hidden` attribute/property (`style="display: none"` +
      `err.style.display` instead), no arrow functions, `const`, or `let`,
      no `.textContent` (innerHTML for the static error string). Old
      Windows captive-portal browsers (IE8-era) can run `doLogin()`
      fully. Pinned by the "is ES3-safe for old captive-portal browsers"
      test.
- [x] No trailing commas anywhere in the inline scripts (2026-09-23
      incident): a trailing comma in a FUNCTION CALL is ES2017 syntax —
      Prettier introduced one when it wrapped `replace()` across lines,
      which made IE8-era browsers throw a SyntaxError at PARSE time.
      `doLogin` never got defined, the form submitted natively with an
      empty password, and every login failed with "invalid username or
      password" while modern browsers kept working. Pinned by the
      "has no trailing commas" test. Never let formatters reflow this
      file's inline script into multi-line calls.
- [x] `$(error)` renders as destructive error text under the input and the
      input re-focuses after a failed attempt.
- [x] The voucher input auto-focuses on page load in both artifacts.
- [x] A vitest smoke test asserts the required MikroTik placeholders exist in
      `login.html`.
- [x] Previewable at `apps/web` origin under `/mikrotik/login.html` (served
      verbatim from `public/`).

## Expected Files

| File                                        | Expected change |
| ------------------------------------------- | --------------- |
| `apps/web/src/app/(portal)/layout.tsx`      | New minimal portal layout (auth-style backdrop, no Back button) |
| `apps/web/src/app/(portal)/portal/page.tsx` | New `/portal` page rendering `VoucherForm` |
| `packages/validators/src/index.ts`            | New `voucherSchema` + `VoucherFormData` (schema lives here alongside the other auth schemas) |
| `apps/web/src/components/portal/voucher-form.tsx` | New client form (RHF + zod, single voucher field) |
| `apps/web/public/mikrotik/login.html`       | New self-contained static portal page |
| `apps/web/src/__tests__/mikrotik-login.test.ts` | Placeholder smoke test for `login.html` |
| `.ai/context/tech-stack.md` / `ROADMAP_AI.md` | Ledger update for the new route/artifact |

## Contracts

| Contract        | Change? | Notes |
| --------------- | ------- | ----- |
| API routes      | no      | No API involved; auth happens on the router |
| DB schema       | no      | Vouchers are MikroTik hotspot users |
| Env vars        | no      | |
| Package exports | yes     | Additive: `voucherSchema` / `VoucherFormData` from `@turbo/validators` |
| UI tokens       | no      | Reuses existing `DESIGN.md` tokens; no runtime token changes |
| Agent memory    | yes     | Spec + roadmap entry; deployment runbook note |

## Pseudocode

```text
1. Add `voucherSchema` (non-empty, trimmed) to `packages/validators/src/index.ts`.
2. Build (portal) layout + /portal page + VoucherForm with Field/Input/Button.
3. Write static login.html mirroring the design with inline CSS and MikroTik
   stock form mechanics (sendin form, doLogin, md5.js, error display).
4. Add smoke test for MikroTik placeholders in login.html.
5. Run design + lint + typecheck + test validation.
6. Update ROADMAP_AI.md and .ai memory; mark spec implemented.
```

## Hotspot Plan Catalog (live on router)

Profiles on the router (all 5M/5M rate-limit, Mikhmon-compatible on-login
expiry scripts, validity runs from first activation):

| Profile           | Price  | Duration | Devices (`shared-users`) |
| ----------------- | ------ | -------- | ------------------------ |
| 1-Day-Unlimited   | ₦1,000 | 24h      | 1                        |
| 1-Week-Unlimited  | ₦3,000 | 7d       | 1                        |
| 1-Month-Unlimited | ₦6,000 | 30d      | 1                        |
| Duo-1-Day         | ₦1,500 | 24h      | 2                        |
| Duo-1-Week        | ₦4,000 | 7d       | 2                        |
| Duo-1-Month       | ₦8,000 | 30d      | 2                        |

Duo profiles (2026-09-22) share the Personal profile scripts with the price
and profile-name substituted, so Mikhmon reporting continues to work.

Operational notes for this router (RouterOS 7.19.6, REST API):

- REST **create** requires the `/add` suffix: `POST /rest/ip/hotspot/user/profile/add`
  (a bare `POST` to the collection returns `no such command`).
- Duo vouchers use the same username = password convention as Personal.

## Validation Plan

- [x] `pnpm design:lint`
- [x] `pnpm design:tokens`
- [x] `pnpm ui:composition`
- [x] `cd apps/web && pnpm typecheck && pnpm lint && pnpm test`
- [x] `pnpm turbo run typecheck lint test --filter=@turbo/validators`
- [x] `pnpm ai:contracts` (package export change)
- [x] Manual: open `/mikrotik/login.html` and `/portal` in a browser

## Rollback Plan

The app route and public file are additive; revert the commits. On the router,
restore the backed-up original `hotspot/login.html` to return to the default
portal.

## Notes

- **Deployment runbook:** upload `apps/web/public/mikrotik/login.html` to the
  router's `hotspot` directory via Winbox Files or FTP (back up the original
  first). No walled-garden changes are needed because the page is served from
  the router. Vouchers are hotspot users with username = password.
- MikroTik replaces `$(...)` placeholders server-side; `$(link-login-only)`,
  `$(link-orig)`, `$(error)`, `$(chap-id)`, and `$(chap-challenge)` must remain
  literal in the source file.
- RouterOS `http-chap` hashes `MD5(chap-id + password + chap-challenge)` as one
  concatenated string. Root cause #3 (2026-09-23): RouterOS substitutes
  `$(chap-id)` as a **backslash-octal JS escape** (e.g. `\023`) when the byte
  is non-printable. In an HTML attribute the browser does NOT decode backslash
  escapes, so reading chap-id from a hidden input hashed the literal `\023`
  text — logins failed "invalid username or password" on every session whose
  chap-id byte was non-printable (~63%), regardless of browser age. The fix is
  the vendor pattern: embed both CHAP substitutions directly in JS string
  literals — `hexMD5('$(chap-id)' + voucher + '$(chap-challenge)')` — where
  the JS engine decodes the escape back to the raw byte. The hidden
  `#chap-challenge` input (plain hex, attribute-safe) remains only as the
  no-CHAP detector that falls back to a native PAP post. `hexMD5` takes a
  single argument; passing the voucher as a second argument is silently
  ignored and produces a valid-looking but wrong hash (root cause #1).
- `/md5.js` is served automatically by the router from the hotspot directory;
  it must not be inlined or removed.
- The React `/portal` page is a design reference only — it performs no
  authentication; the deployed portal on the router handles login.
- Default hotspot setup (local users, PAP + CHAP both supported) is the
  assumed auth backend; mechanics are identical if User Manager is adopted
  later.

## Buy Flow (2026-09-23)

The portal now links to the Saleslip storefront so guests can self-serve:

- **Buy button** links to
  `https://api.saleslip.app/?login=$(link-login-only)&mac=$(mac)&ip=$(ip)`.
  The storefront (sibling `usmangurowa-wifi-voucher-mvp`, deployed via Coolify
  as `saleslip-server`) accepts those params, carries them through the
  Paystack order, and its receipt page POSTs the generated voucher straight
  back to the router login link — one-click connect after payment.
- **Walled garden** (required for the link to resolve pre-auth): allow entries
  for `api.saleslip.app`, `checkout.paystack.com`, `paystack.com` on
  `/ip hotspot walled-garden`. Added via REST — note `POST` to
  `/rest/ip/hotspot/walled-garden/add` works; `PUT` returns 500
  ("not allowed by device-mode").
- **Price list + how-it-works** render on the portal (Personal 1 device:
  ₦1,000/1-day, ₦3,000/1-week, ₦6,000/1-month; Duo 2 devices: ₦1,500,
  ₦4,000, ₦8,000).
- The self-contained test bans external URLs except this one storefront link.
- `login.html` is in `.prettierignore`: Prettier reflows the CHAP `hexMD5`
  call with a trailing comma + double quotes, which pre-2017 browsers cannot
  parse (root cause #2, commit d069ae0).
- Pending: support/Telegram contact line — waiting on the Telegram bot
  username from the user.

## Trial Gateway (2026-09-24)

The buy link was dead pre-login: every walled-garden entry (api.saleslip.app,
checkout.paystack.com, paystack.com) reports `.about: "inactivated, not
allowed by device-mode"` even though `/system/device-mode` shows `home` with
`hotspot=true`. The unresolvable contradiction (plus a PUT that wiped a
dst-host during probing) led to a design pivot: skip the walled garden
entirely and give guests a rate-limited trial session, which has full
internet — the store resolves without any whitelist.

- **Router config (hsprof4, id `*4`)**: `login-by` =
  `cookie,http-chap,http-pap,trial`; `trial-uptime-limit` = `5m`
  (REST field name — CLI docs say `trial-uptime`, REST rejects it as
  "unknown parameter"); `trial-uptime-reset` = `0s` = never resets = once
  per MAC; `trial-user-profile` = `trial-5m` (id `*9`, rate-limit 2M/2M,
  shared-users 1, deliberately NO Mikhmon on-login script — trials must
  not create billing records, unlike the Mikhmon profiles `*2`–`*8`).
- **Portal button**: "Get 5 free minutes" links to
  `$(link-login-only)?dst=$(link-orig-esc)&amp;username=T-$(mac-esc)` — the
  vendor per-MAC trial pseudo-username, no password — wrapped in
  `$(if trial == 'yes')` so RouterOS hides it once the device has spent its
  trial. How-it-works steps now: free 5 minutes → buy online → enter code.
- **Caveats**: trial state is in-memory — a router reboot/power-cycle
  re-grants trials to every MAC; MAC spoofing also bypasses the limit.
  Accepted trade-offs.
- REST notes: always PATCH hsprof4 (`PUT` = full replace, clears unset
  fields); GET only returns non-default fields, so `trial-*` was invisible
  before being set.
- Pending: post-purchase bonus 5-minute voucher (platform side, sibling
  worktree `apps/server/src/wifi/`) — after every order, mint a 5-minute
  single-use voucher shown on the receipt page so buyers can re-purchase
  when their data finishes. Needs user go-ahead before editing that tree.

## Portal Layout Rework (2026-09-24, deployed md5 60800730a8e78b21faaad9624f5472d2)

- **Section order**: brand → login form → "Get 5 free minutes" (immediately
  after Connect, no divider) → divider → Prices → "Buy a voucher online" →
  How it works (last). Tightened `.panel` gap 1.5rem→1rem, `.logo`
  margin-bottom 0.75rem→0.5rem, `button` margin-top 1rem→0.75rem so pricing
  is visible without scrolling.
- **Trial redirect**: trial href dst changed from `$(link-orig-esc)` to the
  storefront URL percent-encoded as a nested query value —
  `dst=https%3A%2F%2Fapi.saleslip.app%2F%3Flogin%3D$(link-login-only-esc)%26mac%3D$(mac-esc)%26ip%3D$(ip-esc)`.
  After a successful trial auth RouterOS redirects to the buy page, which
  then has portal context for post-payment auto-connect. Top-level params
  join with `&amp;`; inner URL percent-encodes `? = & : /`.
- **Plan links**: the six price rows are now `<a class="price-row">` links
  to `https://api.saleslip.app/?login=…&mac=…&ip=…&planId=<id>` (day-1,
  week-1, month-1, day-2, week-2, month-2) — tapping a row opens the store
  with that plan preselected. The generic buy button is kept below pricing
  for the no-plan path. **Server dependency**: `GET /` in
  `apps/server/src/wifi/routes/shop.ts` (sibling worktree) currently
  ignores `planId`; sibling session asked to parse it (validated against
  the plan list, ignore unknown ids) and pass `values: { planId }` to
  `renderBuy`. Until it lands, plan links still work — buy page opens with
  the first plan selected (forward-compatible).
- **Tests**: `mikrotik-login.test.ts` now 13 tests — external-href test
  allows exactly 7 storefront hrefs (6 plan rows + buy button, all
  `https://api.saleslip.app/?login=` prefix), new planId link test, trial
  href assertion updated to the store-redirect dst.

## Post-Login Pages (2026-09-24, alogin.html + status.html)

The router previously served stock RouterOS `flash/hotspot/alogin.html`
("You are logged in", 2s refresh, popup-opener JS that modern browsers
block) and `status.html` (trial/username greeting, IP, bytes, uptime).
Both are now branded in `apps/web/public/mikrotik/` with the same design
tokens, panel shell, and Wifi SVG mark as `login.html`.

- **alogin.html** — "You're online" confirmation shown right after voucher
  auth. Voucher code box (`.code-box`, mirrors the login input style) with
  `$(if login-by == 'trial')` → trial note / `$(elif login-by != 'mac')` →
  code box showing `$(username)`. Meta-refresh 3s to `$(link-redirect)`,
  a primary `.go` Continue link to the same target, divider, text-link to
  `$(link-status)`. Zero script blocks.
- **status.html** — "Your session" dashboard: `<dl class="rows">` with
  conditional voucher/trial row, `$(if session-time-left)` time-left row,
  `$(uptime)` connected-for row, `$(bytes-in-nice) / $(bytes-out-nice)`
  data row. Divider. "Buy more time" storefront link
  `https://api.saleslip.app/?login=$(link-login-only)&amp;mac=$(mac)&amp;ip=$(ip)`
  (same format as login.html buy links). "Log out" is a plain anchor to
  `$(link-logout)` (GET URL; no form, no JS — the stock form exists only
  to feed the popup-opener JS). Keeps the stock
  `$(if refresh-timeout)` meta-refresh; manual refresh link to
  `$(link-status)`.
- **No plan details on these pages** — plan name/price/device-count live
  in the API DB, unreachable from router pages; they stay on buy/receipt.
- **RouterOS variables**: `$(username)` IS the voucher code.
  Attribute-position substitutions (`content="3; url=$(link-redirect)"`,
  `href="…$(mac)…"`) rely on RouterOS HTML-escaping in attributes — same
  vendor pattern the stock pages use.
- **Tests**: `mikrotik-hotspot-pages.test.ts` (12 tests) — placeholder
  presence, self-contained (no external CSS/JS, allowlisted hrefs:
  alogin zero external, status exactly one), Wifi mark, logout link,
  meta-refresh conditionals. Run with
  `pnpm --filter web exec vitest run src/__tests__/`.
- **`.prettierignore`** now ignores the whole `apps/web/public/mikrotik/`
  directory (was login.html only).
