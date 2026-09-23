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
  concatenated string — `hexMD5("$(chap-id)" + voucher + "$(chap-challenge)")`.
  `hexMD5` takes a single argument; passing the voucher as a second argument is
  silently ignored and produces a valid-looking but wrong hash (every login
  rejected as invalid).
- `/md5.js` is served automatically by the router from the hotspot directory;
  it must not be inlined or removed.
- The React `/portal` page is a design reference only — it performs no
  authentication; the deployed portal on the router handles login.
- Default hotspot setup (local users, PAP + CHAP both supported) is the
  assumed auth backend; mechanics are identical if User Manager is adopted
  later.
