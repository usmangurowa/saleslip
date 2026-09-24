# ADR-0004: Derive app auth baseURL from the configured https app URL

- **Status**: Accepted
- **Date**: 2026-09-24
- **Scope**: `apps/web/src/auth/server.ts`, Better Auth session cookies

## Context

Better Auth names its session cookie from the auth instance's `baseURL`
protocol: `__Secure-better-auth.session_token` for https, plain
`better-auth.session_token` for http. The API server (`apps/server`) runs
behind `https://api.saleslip.app` and therefore resolves sessions only from
the `__Secure-` cookie.

The web app's auth factory keyed its `baseURL` off `VERCEL_ENV`, which is
never set on Coolify. It fell back to `http://localhost:3000`, so the web
app issued the plain (non-`__Secure-`) cookie. The `/api/wifi-router/*`
proxy forwards the browser's cookie verbatim to the server, which looked
for a differently named cookie and returned `401 Unauthorized` for every
authenticated dashboard call — vouchers, sessions, metrics.

## Decision

The web app derives its auth `baseURL` from `NEXT_PUBLIC_APP_URL` whenever
that value is an `https://` URL, regardless of host platform. Vercel preview
deployments (`VERCEL_ENV === "preview"") keep their dynamic
`https://<vercel-url>` precedence; everything else falls back to
`http://localhost:3000` for local development.

## Consequences

- Web and server auth instances now name the session cookie identically in
  every environment, and the verbatim-forwarding proxy works unchanged.
- Deployments that previously logged in under the plain cookie name
  invalidate those sessions once this ships; users must sign in again.
- Any new runtime that fronts the app with https must set
  `NEXT_PUBLIC_APP_URL` to that https origin, or cookie names diverge again.

## Verification notes (in-container, Coolify)

A synthetic `__Secure-better-auth.session_token` cookie signed with
`AUTH_SECRET` passes `adminMiddleware` (endpoint proceeds to the MikroTik
call and fails 503 only because the router is unreachable), while the plain
cookie name gets 401. This is the fastest way to prove whether a 401 wave is
server-side (secret/DB/middleware) or client-side (cookie name/attributes).