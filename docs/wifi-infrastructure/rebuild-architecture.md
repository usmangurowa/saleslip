# Rebuild architecture

The design for rebuilding saleslip from scratch, after learning about RADIUS and studying HotFii. Written on 2026-10-16. Where this disagrees with [rebuild-plan.md](rebuild-plan.md) or `docs/wifi-platform-plan.md`, this file wins.

## The one idea behind everything

**Head office knows everything. The router only enforces.**

Today the truth is spread across the router, Mikhmon, the login page file and the database, and they drift apart. In the rebuild, the database is the only place anything is decided. The router holds almost no business data, so it can be reset, replaced or swapped for another brand without losing anything.

## The twelve changes

Each change says what we do, then what it means.

### 1. RADIUS for every login

- **Do:** the router asks head office about every code. Plans become limits sent with each "yes". See [radius.md](radius.md).
- **Means:** no pushing tickets, no stuck sales, no per-plan router profiles, no Mikhmon, no swapped speeds. Prices change in one place.

### 2. One tunnel per router, carrying everything

- **Do:** each router gets its own WireGuard identity from the server. RADIUS, kick requests, monitoring and setup changes all travel inside it.
- **Means:** one path to secure and watch. The router starts the tunnel, so Starlink's shared address doesn't matter. Each router can only reach head office, not other customers' routers.

### 3. The login page lives in the cloud

- **Do:** the router's `login.html` becomes a tiny page that forwards to `portal.saleslip.app`, passing the phone's MAC, IP and the router's login link. The real page is part of `apps/web`, served over HTTPS.
- **Means:** changing prices, logo or wording never touches the router. No more copying files over SSH. The walled garden shrinks to the portal and the payment provider. It also fixes the `router.lan` and plain-http problems.

### 4. Pay and you're online

- **Do:** after Paystack confirms payment, the portal logs the phone in itself by sending the code to the router's login link. Cash buyers still type a printed code.
- **Means:** online buyers never type anything. Later, "remember this device" can let returning phones in by MAC address. Phones change their MAC address per network or over time, so treat that as a convenience, not a guarantee.

### 5. Desired state, not commands

- **Do:** the database stores how every router *should* look (a versioned "desired config"). A worker compares it with the real router and fixes differences. The setup app and the server run the same recipes from `packages/provision`.
- **Means:** half-finished setups resume. Hand edits on the router get flagged as drift. Every change has a version, so undo is "go back to version 12".

### 6. A heartbeat outside the tunnel

- **Do:** the router calls `api.saleslip.app/heartbeat` every minute with `/tool fetch` (needs device-mode `advanced`). It sends uptime, CPU, users online and whether the tunnel is up.
- **Means:** you can tell "the site has no internet" apart from "the site is fine but the tunnel broke". That makes alerts specific and fixes faster.

### 7. Offline vouchers for bad days

- **Do:** keep a small pool of codes as local users on each router. Printed slips draw from this pool first. Head office tracks which ones were sold and used.
- **Means:** if the VPS or tunnel is down, the shop at the counter keeps selling. MikroTik checks local users before RADIUS, so this needs no special logic on the router. Confirm the order on CHR.

### 8. Multi-tenant from day one

- **Do:** organisation → sites → routers and APs. Plans, branding, staff and a Paystack sub-account belong to the organisation. Roles: owner, manager, cashier, agent.
- **Means:** a second business signs up without a new deployment. Split payments send money straight to the owner, as HotFii does. Agents earning commission comes almost free.

### 9. Zero-touch kits

- **Do:** routers set up before shipping carry a claim code (a QR on the box). On first boot the router phones home. The owner scans the QR in the phone app and the router appears in their account.
- **Means:** kit buyers never run the desktop app. The desktop app is for people bringing their own router, and for repairs.

### 10. Usage and Starlink health feed the dashboard

- **Do:** RADIUS accounting gives usage per code and per site. The server polls the Starlink dish's local status interface (`192.168.100.1:9200`) through the tunnel and router.
- **Means:** "top users", "data sold today" and "your dish is blocked 4% of the time" all come from data arriving on its own, with no extra device on site. Nobody else markets this for Starlink resellers.

### 11. Other brands through RADIUS and the hosted portal

- **Do:** MikroTik first. Then TP-Link Omada and Ubiquiti UniFi, which support external portals and RADIUS, through the same RADIUS service and portal.
- **Means:** most of the product is brand-neutral. Each new brand needs a setup adapter, not a new billing system.

### 12. Every sale is a chain of recorded events

- **Do:** order created → payment confirmed → code active → first login → expired. Each step is a database record. Background work (alerts, reconcile, emails) runs from a job queue stored in Postgres. Every handler is safe to run twice.
- **Means:** support questions ("I paid but can't connect") have a clear answer from the record, and a restart never loses or doubles a sale.

## The parts

| Part | Job |
|---|---|
| `apps/web` | Owner dashboard and the hosted login portal |
| `apps/server` | API, Paystack webhooks, heartbeat, tunnel manager, reconcile worker, jobs |
| `apps/radius` (new) | Login checks, usage accounting, kick requests |
| `apps/desktop` (new) | Mac/Windows setup app over the Ethernet cable |
| `apps/mobile` | Owner and cashier app: sell, print, watch, get alerts |
| `packages/provision` (new) | Desired config and recipes, shared by desktop and server |
| `packages/routeros` | Talks to RouterOS (API and REST) |
| `packages/db` | Organisations, sites, routers, plans, codes, sessions, events |

## How it looks

```
Phone ─► AP (open WiFi) ─► MikroTik hotspot ─► Starlink ─► Internet
                               │   │
          heartbeat (https) ───┘   └─── WireGuard tunnel (router dials out)
                   │                         │  RADIUS, kick requests,
                   ▼                         ▼  monitoring, setup changes
          ┌───────────────────── Head office (VPS) ─────────────────────┐
          │ apps/server   apps/radius   apps/web (dashboard + portal)   │
          │ Postgres: the only source of truth                          │
          └─────────────────────────────────────────────────────────────┘
                   ▲
     Owner: web dashboard, phone app.  Setup: desktop app or kit QR.
```

## Build order

| Phase | What | Rough size |
|---|---|---|
| 0 | Test lab: CHR on the laptop, Docker CHR in CI, an old phone as the customer | 3–5 days |
| 1 | `apps/radius` against CHR: accept, reject, limits, accounting, kick. ADR-0005 accepted | 2 weeks |
| 2 | Hosted portal, pay-and-go, offline voucher pool | 1–2 weeks |
| 3 | Multi-tenant data model, tunnel manager, desired config and reconcile, heartbeat | 2–3 weeks |
| 4 | Move Guilders over gradually (see [radius.md](radius.md)) and retire Mikhmon | 1 week |
| 5 | Desktop setup app (see [setup-without-winbox.md](setup-without-winbox.md)) | 3–4 weeks |
| 6 | Phone app, kits with claim codes, Starlink health, then Omada and UniFi | ongoing |

Estimates are guesses for one person working with agents. Buy one cheap real MikroTik before phase 5, because CHR can't test the device-mode power pull.

## Risks

1. **RADIUS uptime is login uptime.** One VPS means one point of failure for new logins. The offline voucher pool covers counter sales. Add a second RADIUS server once there are paying customers.
2. **MikroTik CoA support is partial.** Disconnect works per forum reports; some mid-session changes may not. Design features around `Session-Timeout` and data limits, and treat CoA as a bonus.
3. **Phone MAC randomisation** limits "remember this device".
4. **Starlink commercial terms.** Check whether reselling is allowed on the plan used.
5. **A competitor already exists** (see [competitors.md](competitors.md)). Ship the Starlink-specific and zero-terminal parts early, since those are what set saleslip apart.
