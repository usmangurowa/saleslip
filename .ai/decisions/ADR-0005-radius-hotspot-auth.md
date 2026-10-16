# ADR-0005: Use RADIUS for hotspot logins in the rebuild

- **Status**: Proposed
- **Date**: 2026-10-16
- **Scope**: WiFi rebuild: new `apps/radius`, router setup recipes, `packages/db` session and usage tables

## Context

Today the server creates a hotspot user on the MikroTik for every sale, over the RouterOS API through the WireGuard tunnel. Plans depend on router profiles typed by hand and on Mikhmon on-login scripts for expiry. This caused stuck sales when the router was unreachable, prices that disagree between the database, the login page and Mikhmon, and a speed limit set the wrong way round. It also ties the product to MikroTik.

RADIUS lets the router ask a server whether each code is valid and what its limits are, and report usage back. MikroTik hotspots and most other business WiFi gear support it.

## Decision

In the rebuild, hotspot logins use RADIUS:

- A TypeScript RADIUS service (`apps/radius`) answers authentication and accounting, reading the same database as `apps/server`.
- Plan limits go out as reply attributes (`Session-Timeout`, `Mikrotik-Rate-Limit`, `Mikrotik-Total-Limit`, `Acct-Interim-Interval`), built by code from the plan record.
- RADIUS and disconnect requests travel inside each router's WireGuard tunnel.
- Each router keeps a small pool of local offline vouchers for when the server or tunnel is down.

Details are in `docs/wifi-infrastructure/radius.md`.

## Consequences

- No code is written to the router per sale, so the push-and-retry path and Mikhmon go away.
- New logins depend on the RADIUS service and the tunnel being up. People already online are not affected. Offline vouchers cover counter sales.
- Other RADIUS-capable brands can use the same service.
- The team owns RADIUS protocol code. FreeRADIUS with its REST module stays as the fallback.

## Before accepting

Prove on a CHR virtual router:

1. Accept and reject, with each reply attribute enforced.
2. Accounting start, interim and stop arrive with correct byte counts.
3. Disconnect requests work for hotspot sessions. Record which CoA changes work.
4. Local users are checked before RADIUS, so offline vouchers work when RADIUS is unreachable.
