# Saleslip WiFi — Implementation Plan

Multi-tenant hotspot-monetisation platform for Starlink/MikroTik owners.
Domain: `saleslip.app`. First tenant: Guilders (already wired via WireGuard).

> Living document. The single-tenant MVP that starts this plan is tracked in
> `.ai/specs/active/wifi-voucher-mvp.spec.md`; the repo README documents its
> deployment.

---

## 0. Is a SaaS feasible? — Yes. Here's the shape of it.

The only hard problem in a hotspot SaaS is **reaching routers that sit behind CGNAT** — and it is already solved for one router (Guilders). The SaaS is that same pattern, automated per tenant.

### What makes it work

| Problem                                          | Solution                                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router has no public IP (Starlink CGNAT)         | Platform runs a WireGuard hub. Each router gets its own peer + tunnel IP (`10.20.x.y`). Router dials out; platform talks back over the tunnel. `/16` = 65k routers.                                                               |
| Onboarding must be one step                      | Tenant pastes **one line** into the router terminal: `/tool fetch url="https://saleslip.app/o/<token>.rsc"; /import <token>.rsc`. The script creates the WireGuard peer, API user, firewall rule, walled garden, and phones home. |
| Vouchers must keep working when platform is down | Vouchers live **on the router** (`/ip/hotspot/user`). Platform is the control plane, router is the enforcement plane. Internet keeps being sold/enforced even if saleslip.app is offline; platform re-syncs on reconnect.         |
| Every tenant needs their own money               | **Paystack Subaccounts + Split**: customer pays → Paystack settles tenant's share to _their_ bank next day, your commission to yours. You never hold their money — no licence/escrow headache.                                    |
| Telegram per tenant                              | Tenant creates a bot via @BotFather, pastes the token. Platform sets the webhook to `saleslip.app/api/tg/<tenantId>`. Their brand, your engine.                                                                                   |
| Captive portal per tenant                        | Portal builder → generates `login.html` → router **pulls** it (`/tool fetch`) over the tunnel.                                                                                                                                    |

### Business model (pick one, or both)

- **Subscription** per router: ₦5k–15k/month by tier (vouchers/month, routers, Telegram, portal builder).
- **Transaction fee**: 2–5% on every voucher sold via Paystack split. Zero-friction to start ("free until you make money"), scales with their revenue.
- Recommended: Free tier (manual vouchers, 1 router) → Pro (Paystack, Telegram, portal, 3% fee) → Business (multi-router, staff roles, 2% fee, ₦10k/mo).

### Market

Every Starlink kit sold in Nigeria to a shop, hostel, estate, event centre, or village "internet centre" is a potential tenant. Mikhmon (what you're using now) is free but single-tenant PHP, no payments, no Telegram, needs its own VPS. You'd be selling the thing people currently glue together themselves.

### Honest risks

1. **3-D Secure on card payments** — bank ACS pages live on unpredictable domains, hard to whitelist in the walled garden. Mitigation: push **bank transfer / USSD / OPay** as primary methods (no redirect), allow cards with a "connect via mobile data to pay by card" fallback.
2. **Support load** — MikroTik config varies wildly. Mitigation: onboarding script + strict "supported topology" doc + diagnostics endpoint that reads the router config and flags issues.
3. **Router-local vouchers don't survive a factory reset.** Mitigation: platform keeps the canonical copy; "Restore vouchers to router" button.
4. **Starlink router WiFi bypasses the hotspot** (see §1). This will bite every tenant; the onboarding doc must cover it first.

---

## 1. Phase 0 — Fix the physical network (Guilders, this week)

### 1.1 The catch: the AP is on the wrong side

The Guilders hEX (RB750Gr3) has **no WiFi**. The WiFi customers see today is the **Starlink router's** — and that sits _upstream_ of the MikroTik, so anyone joining it gets internet **without ever touching the captive portal**. Only wired clients (like the owner's laptop) are being captured.

### 1.2 Fix

```
Starlink dish ──► Starlink router (BYPASS MODE, WiFi off)
                        │ ether
                  MikroTik hEX ether1 (WAN, DHCP client)
                        │ ether2–5 (bridge, hotspot)
                  Access Point(s)  ◄── customers connect here
```

1. **Starlink app → Settings → Bypass Mode → enable.** Starlink router becomes a dumb pass-through; MikroTik ether1 gets the CGNAT IP directly. (Gen 2 kits need the Starlink Ethernet Adapter; Gen 3 has ports built in. Bypass is reversible only by factory-resetting the Starlink router — that's fine.)
2. **Add an AP** to ether2–5. Options:
   - MikroTik **cAP ax** (~₦90k) or **hAP ax²** — same vendor, PoE-able, managed in Winbox.
   - TP-Link **EAP225/EAP610** — cheap, Omada app, good range.
   - Ubiquiti **U6 Lite** — best roaming if you'll have several.
     For a shop/hall under 50 users one AP is fine; large compounds want 2–3 wired back to the hEX.
3. **AP config** (any brand): mode = _Access Point / bridge_ (not router — no NAT, no DHCP), SSID `Guilders Starlink`, **security = Open (none)**, enable _client isolation_, disable AP's own DHCP. The MikroTik hands out IPs and the portal does the auth.
   - MikroTik cAP example: `/interface/wifi set [find] configuration.ssid="Guilders Starlink" configuration.mode=ap security.authentication-types="" disabled=no` and add the wifi interface to a bridge whose ether port uplinks to the hEX.
4. Rename/open-network answer: **yes, remove the WiFi password** — the voucher _is_ the password. An open SSID is standard for captive portals (hotels, airports). The MikroTik `hotspot1` with `addresses-per-mac=2` and per-voucher `shared-users` is what stops freeloading.

### 1.3 MikroTik hardening (before shipping the box)

```
/ip/service disable telnet,ftp,www-ssl,api-ssl
/ip/service set ssh address=192.168.88.0/24,10.0.0.0/8
/ip/service set www address=192.168.88.0/24,10.0.0.0/8
/ip/firewall/filter add chain=input in-interface=ether1 action=drop comment="drop WAN input" place-before=[find comment~"VPS mgmt"]
/system/ntp/client set enabled=yes servers=time.cloudflare.com
/system/clock set time-zone-name=Africa/Lagos
/interface/wireguard/peers set 0 endpoint-address=vpn.usmangurowa.dev
/export file=guilders-wifi-$(date)        # download via Files, keep off-site
```

(Check firewall order after `place-before` — the WireGuard accept rule must stay above the WAN drop.) Test: unplug power, wait for boot, confirm `last-handshake` returns without touching anything.

### 1.4 Hotspot tweaks worth doing now

```
/ip/hotspot/profile set hsprof3 login-by=http-chap,cookie,mac-cookie http-cookie-lifetime=1d dns-name=wifi.guilders.ltd
/ip/hotspot set hotspot1 idle-timeout=10m
/ip/hotspot/walled-garden add dst-host=saleslip.app
/ip/hotspot/walled-garden add dst-host=*.saleslip.app
/ip/hotspot/walled-garden add dst-host=*.paystack.co
/ip/hotspot/walled-garden add dst-host=*.paystack.com
/ip/hotspot/walled-garden add dst-host=checkout.paystack.com
/ip/hotspot/walled-garden/ip add dst-address=195.179.227.24 action=accept comment="saleslip VPS"
```

`mac-cookie` = customer reconnects without re-entering the code for 1 day.

---

## 2. Architecture

```
                    saleslip.app (Coolify, 195.179.227.24)
 ┌───────────────────────────────────────────────────────────────┐
 │  apps/web  (Next.js)         apps/server (Hono, long-lived)   │
 │  ├ marketing / pricing       ├ /api/*  (Hono RPC, tenant-scoped)
 │  ├ /app  tenant dashboard    ├ RouterConnector pool (API sockets over WG)
 │  ├ /p/<slug> buy page        ├ Paystack webhook
 │  ├ /r/<code> receipt         ├ Telegram webhooks (per tenant)
 │  └ /o/<token>.rsc onboarding ├ WireGuard peer manager (wg-easy API or wgctrl)
 │                              └ BullMQ workers (sync, retry, expiry, receipts)
 │  Postgres (Drizzle)   Redis (BullMQ)   wg-easy (hub, UDP 51820)
 └───────────────────────────────────────────────────────────────┘
          ▲ WireGuard tunnels, one per router (10.20.0.0/16)
   ┌──────┴──────┐     ┌─────────────┐     ┌─────────────┐
   │ Guilders    │     │ Tenant B    │     │ Tenant C    │
   │ hEX 10.20.0.2│    │ hAP 10.20.0.3│    │ ...         │
   └─────────────┘     └─────────────┘     └─────────────┘
```

### 2.1 Key design decisions

| Decision                     | Choice                                                                                                            | Why                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Voucher source of truth      | Router (`/ip/hotspot/user`) mirrored to Postgres                                                                  | Works when platform is down. Platform reconciles.                                                          |
| Router comms                 | RouterOS API (8728) over WireGuard, held open by `apps/server`                                                    | Real-time (active users, kick, live traffic). Never from Next.js route handlers — they can't hold sockets. |
| Voucher issuance on purchase | **Pre-provisioned pool**: each plan keeps N unsold codes already created on the router. Purchase = mark one sold. | Instant delivery, immune to a router blip mid-payment. Worker tops pool back up.                           |
| Payments                     | Paystack Transaction Initialize + Webhook (never trust the redirect) + Subaccount split                           | Standard, idempotent on `reference`.                                                                       |
| Tenant isolation             | `tenant_id` on every table, enforced in a Drizzle query wrapper + Better Auth `organization` plugin               | Better Auth org plugin gives you tenants + members + roles for free.                                       |
| Telegram                     | BYO bot token per tenant, webhook mode                                                                            | Tenant branding; no polling processes.                                                                     |
| Portal                       | Templated `login.html`, router pulls it                                                                           | No file-upload API needed; `/tool fetch` is on every RouterOS.                                             |
| Jobs                         | BullMQ on Redis                                                                                                   | Retries with backoff for router-offline cases.                                                             |

### 2.2 Why not RADIUS (yet)

RADIUS (FreeRADIUS + `/radius add`) centralises users and gives accounting — the "proper" ISP way. But: vouchers stop working if the platform or tunnel is down, and it's harder for tenants to reason about. Start with router-local users; add RADIUS as an opt-in "Enterprise" mode in v2 when you have tenants running 5+ routers who want roaming.

---

## 3. Data model (Drizzle, `packages/db`)

```ts
// tenancy (Better Auth organization plugin supplies organization/member/invitation)
tenants            id, slug, name, logo_url, brand_color, currency 'NGN', timezone,
                   paystack_subaccount_code, plan_tier, created_at
tenant_settings    tenant_id PK, support_phone, receipt_footer, portal_config jsonb,
                   telegram_bot_token (encrypted), telegram_bot_username, sms_provider jsonb

// routers
routers            id, tenant_id, name, model, ros_version, serial,
                   wg_public_key, wg_preshared_key(enc), wg_tunnel_ip, wg_last_handshake_at,
                   api_username, api_password(enc), api_port 8728,
                   hotspot_server 'hotspot1', hotspot_profile, dns_name,
                   status enum(pending,online,offline,error), last_seen_at, last_error,
                   onboarding_token, onboarded_at, config_snapshot jsonb
router_events      id, router_id, type, payload jsonb, at   // online/offline/sync/errors

// catalogue
plans              id, tenant_id, router_id (nullable = all routers), name, slug, description,
                   price_kobo, validity (e.g. '1d'), uptime_limit ('3h' | null),
                   data_limit_bytes (null=unlimited), rate_limit ('2M/5M'),
                   shared_users, lock_to_mac bool, ros_profile_name, sort_order, active bool,
                   pool_target int (e.g. 30), sellable_online bool, sellable_telegram bool

// vouchers
vouchers           id, tenant_id, router_id, plan_id, code, password (= code by default),
                   status enum(pooled,sold,active,expired,revoked,pending_router),
                   batch_id, sold_at, first_login_at, expires_at, revoked_at,
                   bytes_used, uptime_used, mac_address, comment,
                   ros_id (".id" on router), synced_at
voucher_batches    id, tenant_id, router_id, plan_id, qty, created_by, label, printed_at

// commerce
orders             id, tenant_id, router_id, plan_id, voucher_id,
                   channel enum(portal,web,telegram,pos,manual),
                   customer_phone, customer_email, customer_telegram_id, customer_mac, customer_ip,
                   amount_kobo, fee_kobo, tenant_share_kobo,
                   paystack_reference UNIQUE, paystack_access_code, paystack_status,
                   status enum(pending,paid,fulfilled,failed,refunded), paid_at, fulfilled_at
payment_events     id, order_id, provider 'paystack', event, raw jsonb, at   // webhook log

// telegram
telegram_users     id, tenant_id, telegram_id, username, phone, first_seen, last_seen
telegram_sessions  telegram_id+tenant_id PK, state jsonb, updated_at

// platform billing (SaaS)
subscriptions      id, tenant_id, tier, paystack_subscription_code, status, current_period_end
platform_ledger    id, tenant_id, order_id, commission_kobo, settled bool, at

// staff & audit
audit_log          id, tenant_id, actor_id, action, target, meta jsonb, at
```

Indexes: `vouchers(router_id,status)`, `vouchers(code)`, `orders(paystack_reference)`, `routers(wg_tunnel_ip)`.

---

## 4. Router connector (`apps/server/src/routeros/`)

The heart of the system. One module, well-tested.

```
RouterConnector
  ├ pool: Map<routerId, RouterOSClient>      (node-routeros or routeros-client)
  ├ connect(router)  → open API socket to wg_tunnel_ip:8728, login, mark online
  ├ heartbeat 30s    → /system/resource/print; on fail → backoff reconnect, mark offline
  ├ exec(routerId, cmd, params)              → single command w/ timeout, queued per router
  └ events           → emit online/offline for UI + Telegram admin alerts

HotspotService (uses RouterConnector)
  ├ ensureProfile(plan)      /ip/hotspot/user/profile add|set  (+ on-login expiry script)
  ├ createUsers(plan, codes) /ip/hotspot/user add ×N   (batched, 20 at a time)
  ├ listUsers / listActive / kick(user) / remove(user) / setDisabled
  ├ syncFromRouter(routerId) reconcile vouchers table ↔ router users (bytes, uptime, status)
  ├ pushWalledGarden(entries) / pushPortalFiles(urls) (/tool fetch on router)
  ├ readConfig()  → hotspot servers, profiles, device-mode, ros version → config_snapshot
  └ diagnose()    → checklist: hotspot active? scheduler on? walled garden ok? NTP set? WAN drop rule?

WireGuardManager
  ├ createPeer(router) → allocate 10.20.x.y, gen keys via wg-easy REST (or wgctrl in-container)
  ├ removePeer / rotateKeys
  └ pollHandshakes 60s → routers.wg_last_handshake_at
```

**Expiry script** (written into each ROS profile's `on-login`, Mikhmon-style) — sets `limit-uptime`/scheduler so `validity` counts from _first login_:

```
:put (",rem,1d,100,"); :local mac $"mac-address"; :local time [/system clock get time]; ...
```

Reuse Mikhmon's proven script text; don't reinvent.

**Voucher pool worker** (BullMQ, every 5 min + on purchase): for each active plan, `count(status='pooled') < pool_target` → generate codes → `createUsers` → insert as `pooled`. If router offline → insert as `pending_router`, retry later.

**Code format**: `${prefix}${5 digits}` e.g. `GW48213` — short enough to type on a phone, unambiguous chars only (no 0/O/1/I). Uniqueness enforced per router.

---

## 5. Phase 1 — Core platform (replaces Mikhmon) · ~2 weeks

### 5.1 Auth & tenancy

- Better Auth + `organization` plugin. Sign-up creates a tenant (org). Roles: `owner`, `manager`, `cashier`.
- Email/password + Google. Phone OTP later (Termii).
- Middleware: every `/api/*` resolves `tenantId` from session's active org; every Drizzle query goes through `db.forTenant(tenantId)` helper.

### 5.2 Router onboarding

1. Dashboard → **Add router** → name it → platform allocates tunnel IP, generates WG keys + API password, stores `onboarding_token` (24h).
2. Shows **one command** to paste in Winbox terminal:
   `/tool fetch url="https://saleslip.app/o/<token>.rsc" dst-path=saleslip.rsc; /import saleslip.rsc`
3. `/o/<token>.rsc` (Next route handler, text/plain) renders a RouterOS script:
   - `/interface/wireguard add name=wg-saleslip private-key=...`; peer to `vpn.saleslip.app:51820`, `allowed-address=10.20.0.0/16,10.0.0.0/8`, keepalive 25s
   - `/ip/address add 10.20.x.y/16 interface=wg-saleslip`
   - `/user/group add name=saleslip policy=api,read,write,test,sensitive`; `/user add name=saleslip ...`
   - `/ip/service set api address=10.20.0.0/16,10.0.0.0/8 disabled=no`
   - input firewall accept from wg-saleslip, placed at top
   - walled-garden entries for saleslip.app + paystack
   - `/tool fetch url="https://saleslip.app/o/<token>/done" keep-result=no` → marks router `online`, kicks off `readConfig` + `diagnose`.
   - Prints a banner: if `device-mode hotspot=no` or `scheduler=no` → instruct power-cycle.
4. Dashboard router page shows live status, diagnostics checklist, "Re-run setup", "Download backup" (`/export` via API).

### 5.3 Plans

CRUD with a **live preview card** (what customers see). On save → `ensureProfile` on every linked router. Plan changes propagate to profile (rate limit, shared users) — existing vouchers inherit, which is what you want.

### 5.4 Vouchers

- **Generate** (manual/cash sales): qty, plan, prefix, label → batch → print sheet (A4 grid of tear-off cards, or 58mm thermal roll). Server-rendered HTML page with `@media print`; PDF via Playwright/`@react-pdf/renderer` for download.
- **List** with filters (status, plan, batch), search by code, bulk revoke, resend.
- **Active sessions** (live, polls `listActive` every 10s): user, IP, MAC, uptime, bytes, **Kick** button.
- **Sync** button + hourly job: pulls bytes/uptime/status from router; marks expired.

### 5.5 Dashboard

Today's revenue, vouchers sold (by channel), active users, router health, Starlink WAN throughput graph (`/interface/monitor-traffic ether1`), recent hotspot log.

### 5.6 Deliverable

Guilders fully managed from `saleslip.app/app`; Mikhmon container retired.

---

## 6. Phase 2 — Paystack + public buy page + receipts · ~1.5 weeks

### 6.1 Paystack setup (per tenant)

- Tenant → **Payments** → "Connect bank": form → `POST /subaccount` (business name, bank code, account number, `percentage_charge` = your commission). Store `subaccount_code`. Verify with `GET /bank/resolve`.
- Platform Paystack keys in env; tenant never sees keys. Webhook URL: `https://saleslip.app/api/paystack/webhook` (one for all tenants — route by `metadata.tenant_id`).

### 6.2 Public buy page `saleslip.app/p/<tenantSlug>`

Reached from the captive portal's **Buy** button with `?mac=…&ip=…&router=…&login=<link-login-only>`.

1. Shows plans (only `sellable_online`), brand colours, support phone.
2. Customer picks plan, enters phone (and optional email).
3. `POST /api/orders` → create `order(pending)` → `POST paystack/transaction/initialize` with `amount`, `email` (phone@saleslip.app fallback), `subaccount`, `bearer:'subaccount'`, `metadata:{order_id,tenant_id,router_id,plan_id,mac}`, `callback_url: saleslip.app/p/<slug>/done?ref=…`, `channels:['bank_transfer','ussd','mobile_money','card']` (order matters — put transfer first).
4. Redirect to `authorization_url` (Paystack hosted checkout — in the walled garden).
5. Webhook `charge.success` → verify `x-paystack-signature` (HMAC-SHA512) → idempotent on `reference` → `fulfill(order)`: take a `pooled` voucher for that plan/router → `sold` → attach to order → enqueue receipt delivery (SMS/Telegram/email).
6. Callback page polls `GET /api/orders/<ref>` until `fulfilled`, then shows the **code big and bold**, a "Connect now" button that POSTs to the router's `link-login-only` with username/password prefilled (auto-login), and a link to the receipt.

### 6.3 Receipts `saleslip.app/r/<code>` (public, unguessable code)

- Tenant logo, name, address, plan, validity, price, code, QR (encodes the auto-login URL), "how to connect" steps, support phone, footer text.
- Formats: web page, **58mm thermal** print CSS, PNG (satori/`@vercel/og`) for WhatsApp/Telegram, PDF download.
- **Receipt template editor** in Settings: logo, colours, footer, show/hide fields. Live preview.
- SMS delivery via **Termii** (cheap, Nigerian): "Your Guilders Starlink code: GW48213. Valid 24h. Receipt: saleslip.app/r/…". Optional per tenant (they pay per SMS or you bundle).

### 6.4 3DS reality

Card payments may redirect to a bank's ACS domain outside the walled garden. Handle:

- Buy page banner: "Bank transfer & USSD work while offline. For card, switch to mobile data for 1 minute."
- Add the most common ACS hosts to walled garden as discovered (`*.interswitchng.com`, `*.gtbank.com`, …) — maintained centrally, pushed to all routers.
- Or open the walled garden to all HTTPS during a 5-minute "payment window" per MAC (`/ip/hotspot/ip-binding` bypass, auto-removed) — clever but abusable; make it optional.

---

## 7. Phase 3 — Captive portal builder · ~1 week

### 7.1 Builder

Settings → **Portal**: logo, background (colour/image), headline, plan cards on/off, "Buy" button → `/p/<slug>`, WhatsApp support link, T&Cs text, language (EN/HA/YO/IG). Live preview on phone frame.

### 7.2 Output

Generates the RouterOS hotspot file set, keeping MikroTik's form contract:

- `login.html` — code input (`username`/`password` both = code, hidden password mirrors), `$(link-login-only)`, `$(error)`, CHAP JS (`md5.js`) kept; **Buy** link with `?mac=$(mac)&ip=$(ip)&login=$(link-login-only)&router=<id>`.
- `alogin.html` — "You're connected. Expires in X." + branded.
- `status.html`, `logout.html`, `error.html`, `rlogin.html`, `redirect.html`, `md5.js`, `img/logo.png`.
  Assets hosted at `saleslip.app/portal/<routerId>/<file>` (versioned, cache-busted).

### 7.3 Push

"Publish" → job → for each file: router `/tool fetch url=… dst-path=hotspot/<file>` (over tunnel), then `/ip/hotspot/profile set html-directory=hotspot`. Verify by fetching `http://<router tunnel ip>/login` from the server and diffing.

### 7.4 Auto-login after purchase

`/p/<slug>/done` builds `http://<hotspot dns>/login?username=X&password=X&dst=http://neverssl.com` and does a JS form POST to `link-login-only` — customer is online without typing anything. Works because `login-by=http-chap,http-pap` — enable `http-pap` too on the profile for this (over the LAN it's fine).

---

## 8. Phase 4 — Telegram · ~1 week

### 8.1 Tenant setup

Settings → **Telegram** → paste BotFather token → platform `setWebhook(https://saleslip.app/api/tg/<tenantId>?secret=…)` → shows deep link `t.me/<bot>?start=buy` for their signage/QR.

### 8.2 Bot (grammY, one handler, tenant resolved from URL)

```
/start        → welcome (tenant brand) + buttons: 🛒 Buy | 🎟 My vouchers | ❓ Help
Buy           → plan list (inline keyboard) → confirm → Paystack link (same /api/orders flow, channel=telegram)
                 → on webhook fulfil → bot DMs the code + receipt PNG + "How to connect"
My vouchers   → last 5 orders for this telegram_id, remaining data/time (from vouchers table)
Help          → support phone, WhatsApp link
/status (owner only, verified by telegram_id in tenant_settings.admin_telegram_ids)
              → router online?, active users, today's sales
Alerts (owner)→ router offline > 5 min, pool below threshold, daily summary 21:00
```

Payment from Telegram happens on the customer's **mobile data** typically (they're not yet online) — so 3DS isn't an issue here; card works fine.

### 8.3 Later

WhatsApp Cloud API (Meta) — same state machine, different transport. Bigger reach in Nigeria; more setup (business verification).

---

## 9. Phase 5 — SaaS-ification · ~2 weeks

- **Marketing site** `saleslip.app`: hero, how it works (3 steps), pricing, "Supported hardware" (hEX + cAP ax, hAP ax², hAP ax lite — recommend specific bundles), FAQ (Starlink bypass mode, etc.), sign-up.
- **Platform billing**: Paystack Plans + Subscriptions for tiers; commission auto-collected via split. Tenant "Billing" page: tier, invoices, commission ledger, payouts (read from Paystack Settlements API).
- **Multi-router tenants**: plans scoped to all/specific routers; dashboard filter by location.
- **Staff roles**: cashier can only generate/print/lookup; manager everything except billing.
- **Reseller / POS mode**: cashier page optimised for phone: pick plan → prints/shows code → records cash sale (`channel=pos`), end-of-day cash report.
- **Analytics**: revenue by day/plan/channel, peak hours, repeat customers (by MAC/phone), data consumption vs Starlink plan cap (warn at 80% of their Starlink priority data).
- **Notifications**: router offline (Telegram/SMS/email), low pool, failed webhook, new sale.
- **Tenant offboarding**: revoke WG peer, delete API user (script), export data CSV.
- **Docs site** `/docs`: supported topology, Starlink bypass, AP setup per brand, troubleshooting (with the exact device-mode power-cycle gotcha hit during the Guilders setup).

---

## 10. Phase 6 — Operations

| Concern       | Plan                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets       | API passwords, WG keys, bot tokens encrypted at rest (AES-GCM with `APP_ENCRYPTION_KEY`), never logged. Paystack keys via Coolify env.                                                                                                                                                                                                   |
| WireGuard hub | Keep wg-easy for now (has REST API); move to in-process `wgctrl`/`wg` CLI in `apps/server` when >50 routers. Backup `/etc/wireguard` volume nightly.                                                                                                                                                                                     |
| Postgres      | Shared Coolify Postgres (`infra-postgres`, already hosting other databases) with daily S3 backup.                                                                                                                                                                                                                                        |
| Redis         | Small Coolify Redis for BullMQ.                                                                                                                                                                                                                                                                                                          |
| Observability | Pino logs → Coolify; Sentry for web+server; uptime check on `/api/health` (checks DB, Redis, WG interface). Router-level: `router_events` table + dashboard.                                                                                                                                                                             |
| Rate limits   | Buy page + webhook + bot: per-IP/per-MAC limits (Redis).                                                                                                                                                                                                                                                                                 |
| Idempotency   | Paystack `reference` unique; webhook handler is a no-op on replay; fulfilment in a DB transaction with `SELECT … FOR UPDATE SKIP LOCKED` on pooled vouchers.                                                                                                                                                                             |
| Tests         | Vitest unit for voucher/pool/plan logic; integration against a **CHR (Cloud Hosted Router)** docker image (`evilfreelancer/docker-routeros`) so the connector is tested against real RouterOS in CI.                                                                                                                                     |
| Deploy        | Coolify: `apps/web` (Next standalone), `apps/server` (Hono, runs migrations on boot per the repo README), Postgres, Redis, wg-easy. Domains `saleslip.app`, `api.saleslip.app`, `vpn.saleslip.app`. Move Guilders' tunnel off `usmangurowa.dev` by pointing router's `endpoint-address` to `vpn.saleslip.app` (same VPS, zero downtime). |

---

## 11. Sequence & effort

| Phase | Scope                                                                    | Est.                |
| ----- | ------------------------------------------------------------------------ | ------------------- |
| 0     | Starlink bypass + AP + hardening (Guilders)                              | 1–2 days + hardware |
| 1     | Tenancy, router onboarding, connector, plans, vouchers, print, dashboard | 2 wks               |
| 2     | Paystack, buy page, receipts, SMS                                        | 1.5 wks             |
| 3     | Portal builder + push + auto-login                                       | 1 wk                |
| 4     | Telegram                                                                 | 1 wk                |
| 5     | Marketing, billing, roles, POS, analytics, docs                          | 2 wks               |
| 6     | Ops hardening, CI against CHR                                            | ongoing             |

Ship order: **0 → 1 → 2 → 3** gets Guilders earning online in ~5 weeks. **4 → 5** turns it into a product.

---

## 12. Repo layout (in `saleslip`)

```
iapps/web/                        Next.js: marketing, /app dashboard, /p buy, /r receipt, /o onboarding, /portal assets
apps/server/                     Hono: RouterConnector pool, workers, webhooks, telegram
packages/api/                    Hono RPC routes (tenant-scoped) — shared types to web
packages/db/                     Drizzle schema above + migrations
packages/routeros/               NEW: RouterOS API client wrapper, HotspotService, script templates (.rsc), diagnose()
packages/paystack/               NEW: typed client (initialize, verify, subaccount, webhook verify)
packages/portal-templates/       NEW: login.html etc. as templates + renderer
packages/receipts/               NEW: receipt/voucher-sheet renderers (HTML, thermal CSS, PNG, PDF)
packages/telegram/               NEW: grammY bot factory (per tenant), conversation state
packages/validators/             Zod schemas for plans/orders/etc.
```

Drop `apps/mobile` for now (or keep for a cashier POS app later — Expo is already there).

---

## 13. First 10 concrete tasks

1. Phase 0: Starlink bypass mode + order an AP. Apply hardening + walled garden commands (§1.3, §1.4).
2. `packages/routeros`: client wrapper + `HotspotService.createUsers/listActive/kick/ensureProfile` — test against the live Guilders hEX over the tunnel from the Coolify network.
3. `packages/db`: tenants, routers, plans, vouchers, orders schema + migration.
4. Better Auth org plugin; `/app` shell with tenant switcher.
5. Router onboarding flow + `/o/<token>.rsc` generator; test by re-onboarding the hEX (idempotent script).
6. Plans CRUD → profile sync; Vouchers generate + print sheet.
7. Active sessions + kick; hourly sync job.
8. Paystack: subaccount connect, `/p/<slug>`, webhook, pool-based fulfilment, `/p/<slug>/done` auto-login.
9. Receipt renderer + Termii SMS.
10. Portal builder v1 (logo/colour/headline/Buy button) + push to router.
