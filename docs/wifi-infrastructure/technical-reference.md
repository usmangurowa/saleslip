# Technical reference: how saleslip and Guilders WiFi fit together

Snapshot as of 2026-10-16. Built from the original setup transcript, the "Update Guilders WiFi Pricing and Sign-In" thread and this repo. The walled-garden list in that thread was cut off, so it may hold entries not listed here. Secrets are shown as `…` on purpose.

## The big picture in one line

A customer's phone joins the open WiFi. The MikroTik blocks them until they type a voucher code. Vouchers are sold online by **saleslip** on your VPS. The VPS can reach the router, which has no public address of its own, because the router keeps a private **WireGuard** tunnel open to the VPS.

```
Phone ─► AP "Guilders Starlink" (open) ─► MikroTik hEX (portal, vouchers) ─► Starlink ─► Internet
                                                │
                                   WireGuard tunnel (router dials out)
                                                ▼
                    VPS 195.179.227.24 (Coolify)
                    ├─ wg-easy   vpn.usmangurowa.dev   (the tunnel's home)
                    ├─ Mikhmon   wifi.usmangurowa.dev  (old admin panel)
                    ├─ saleslip server (shop, Paystack, Telegram, router control)
                    ├─ saleslip web    saleslip.app (buy page + dashboard)
                    └─ Postgres (shared infra-postgres, "saleslip" database)
```

---

## Part 1: The physical setup

1. **Cables**
   - Starlink router → MikroTik **port 1** (internet in).
   - MikroTik **port 2** → PoE injector "LAN" socket → PoE socket → the access point (AP), a Grandstream GWN7630LR.
   - Ports 3–5 are spare. Your laptop goes there when you're on site.
2. **Why the AP has to sit behind the MikroTik:** the hEX has no WiFi of its own. The portal only applies to traffic that passes through the MikroTik, so customers must join the AP, not the Starlink WiFi.
3. **Starlink WiFi:** renamed to something nobody will recognise, given a strong password and hidden. It's your private backdoor, not for customers.
4. **AP settings:**
   - SSID `Guilders Starlink`, **no password**. The voucher is the password.
   - Bridge/AP mode, with its own DHCP off. The MikroTik hands out the `192.168.88.x` addresses.
   - Its own captive portal off. Country Nigeria, Outdoor.
   - Fixed address `192.168.88.254`.

## Part 2: Getting into the MikroTik (laptop + Winbox)

1. Plug the laptop into port 2–5. It gets an address like `192.168.88.x`.
2. Open **Winbox**, connect to `192.168.88.1` as `admin`. **New Terminal** is where you paste commands.
3. **Turn the hotspot on.** It was showing as "invalid / not allowed by device-mode":
   ```
   /system/device-mode/update hotspot=yes
   ```
   Then **pull the power cable** to confirm; a soft reboot doesn't count.
4. **Turn the scheduler on**, which voucher expiry depends on. Same pull-the-plug confirmation:
   ```
   /system/device-mode/update scheduler=yes
   ```
5. **The hotspot itself:** server `hotspot1` on `bridge`, address pool `default-dhcp`, idle timeout 5m, 2 addresses per MAC.
   - It now uses profile `hsprof4`, with login by code, cookie, or a 5-minute free trial.
   - Cookies keep a device logged in for 3 days.
6. **Testing:** open an `http://` site such as `http://neverssl.com`. A plain http site is needed because https sites don't redirect to a login page.

## Part 3: Remote access (WireGuard)

**The problem:** Starlink gives the router a shared address (CGNAT). Nothing on the internet can dial *in* to it.

**The fix:** the router dials *out* to your VPS and keeps that tunnel open.

1. **On the VPS**, Coolify runs **wg-easy** at `vpn.usmangurowa.dev`. It listens on UDP port 51820 and uses the `10.8.0.x` network.
2. **In wg-easy:** add a client called `mikrotik-hotspot` (address `10.8.0.2`) and copy its keys.
3. **On the router:**
   ```
   /interface/wireguard add name=wireguard1 private-key="…"
   /interface/wireguard/peers add interface=wireguard1 public-key="…" preshared-key="…" \
       endpoint-address=195.179.227.24 endpoint-port=51820 allowed-address=10.0.0.0/8 persistent-keepalive=25s
   /ip/address add address=10.8.0.2/24 interface=wireguard1
   /ip/route add dst-address=10.0.0.0/8 gateway=wireguard1
   /ip/firewall/filter add chain=input in-interface=wireguard1 src-address=10.0.0.0/8 action=accept place-before=0
   ```
4. **Check it:** `/interface/wireguard/peers print detail` should show a `last-handshake` time, and `/ping 10.8.0.1` should get replies.
5. **Why it survives moves and new addresses:** the router is always `10.8.0.2` inside the tunnel. The keepalive (every 25 seconds) reconnects it automatically, even after Starlink changes its address or the box moves to another state.
6. **Winbox from anywhere:**
   - Make a second wg-easy client for your laptop and import it into the WireGuard Mac app.
   - Winbox then connects to `10.8.0.2`.
   - A second client already exists at `10.8.0.3`.

## Part 4: Letting apps control the router (the API)

```
/user/group add name=api-mgmt policy=api,read,write,test,sensitive
/user add name=mikhmon group=api-mgmt password="…"
/ip/service set api disabled=no address=10.0.0.0/8          ← API only reachable through the tunnel
/ip/service set winbox address=192.168.88.0/24,10.0.0.0/8
```

Mikhmon and the saleslip server both log in as the `mikhmon` user on `10.8.0.2:8728`.

## Part 5: Mikhmon (`wifi.usmangurowa.dev`)

1. It runs in a container in the same Coolify stack as wg-easy, so its traffic reaches the router through the tunnel.
2. **Router connection** (Mikhmon calls this a "session"): IP `10.8.0.2`, user `mikhmon`. The session is now named "Guilders Starlink".
3. **Plans** are created as **User Profiles** in Mikhmon: speed limit, devices per code (shared users), validity and price.
   - Mikhmon attaches a small **on-login script** to each profile.
   - When a code is first used, that script sets its expiry date, and Mikhmon later deletes expired codes.
4. **Profiles on the router today:**
   - `1-Day-Unlimited`, `1-Week-Unlimited`, `1-Month-Unlimited`
   - `Duo-*` (two devices; switched off for sale)
   - `1-Day-1GB` (₦50) and `1-Day-5GB` (₦200)
   - `trial-5m` (the free trial)
5. **What Mikhmon still does:** monitoring, and printing counter vouchers. Saleslip is replacing it.

## Part 6: The login page and the "free zone"

1. **The login page** is a custom HTML file on the router at `flash/hotspot/login.html`.
   - It has a voucher box, a 5-minute free-trial button, and price rows.
   - Each price row links to the saleslip shop and passes along the phone's MAC address, its IP and the router's login link.
   - Edits go up by copying the file to the router over SSH (`scp`), routed through the VPS.
2. **The free zone ("walled garden")** is the list of sites unpaid users can open:
   ```
   /ip/hotspot/walled-garden add dst-host=*.saleslip.app        (+ saleslip.app)
   /ip/hotspot/walled-garden add dst-host=*.paystack.co          (+ *.paystack.com)
   /ip/hotspot/walled-garden add dst-host=*.telegram.org         (+ t.me)
   /ip/hotspot/walled-garden/ip add dst-address=195.179.227.24 action=accept
   ```
3. **Two fixes from the thread:**
   - Some phones showed "router.lan not found". Clearing the DNS name fixed it, and everyone could log in after that:
     ```
     /ip hotspot profile set hsprof4 dns-name=""
     ```
   - The AP and your Mac are set to skip the portal, by MAC address under **IP bindings**. That keeps the AP's management page reachable.

## Part 7: The saleslip app (the code)

| Piece | What it does |
|---|---|
| `apps/server` (Hono, port 3001) | The engine: shop pages, Paystack webhook, Telegram bot, router control, health check |
| `apps/web` (Next.js, `saleslip.app`) | Public `/buy` page, receipts, and the admin dashboard (plans, vouchers, batches, live users, profiles, customers, router) |
| `packages/routeros` | A small client the team wrote itself that talks to the MikroTik API (create users, list online users, kick). It replaced `node-routeros`, which crashed on RouterOS 7. |
| `packages/wifi` | Plan rules, voucher codes (`SL` + 5 characters, no confusing 0/O/1/I), order steps |
| `packages/paystack` | Starts a payment and checks Paystack's signature |
| `packages/db` | Postgres tables: plans, orders, vouchers, batches |
| `packages/mail` | Voucher receipt emails (Resend) |

### How a sale works

1. The phone joins the WiFi and gets the login page. The customer taps a price, or types `/buy` to the Telegram bot.
2. Saleslip saves a "pending" order and sends the customer to **Paystack** (bank transfer, USSD or card).
3. Paystack calls saleslip's **webhook**. Only this call counts as proof of payment; the customer's redirect back to the site doesn't.
4. The server makes a code such as `SL7KQ2M` and creates it on the router as a hotspot user:
   - the code is both the username and the password
   - it uses the plan's profile
   - capped plans get their 1 GB or 5 GB data limit on the voucher itself
5. **If the router is offline**, the server retries after 5 seconds, 30 seconds, 2 minutes, 10 minutes and 30 minutes. It also retries waiting orders when it restarts.
6. **The code reaches the customer** on the receipt page, by Telegram message, or by email. They type it into the login page and they're online.
7. **Counter sales:**
   - The dashboard makes up to 200 codes at once and prints them on an A4 sheet, 24 slips per page.
   - The QR code on each slip **joins the WiFi**. It doesn't log the customer in.

**Prices today:** ₦50 (1 GB/day), ₦200 (5 GB/day), ₦500 (day), ₦2,000 (week), ₦5,000 (month). The dashboard's Plans tab edits them; they live in the `wifi_plan` table.

## Part 8: How it's deployed

1. **The VPS:** one machine at `195.179.227.24` running **Coolify**. Coolify's built-in web proxy (Traefik) handles the domains and the https certificates.
2. **The `saleslip-wifi` stack** in Coolify runs wg-easy, Mikhmon and the saleslip server side by side, so all three share the tunnel route.
3. **How the server reaches the router:**
   - When the server container starts, it adds a route: `10.8.0.0/24 via wg-easy`. This needs Docker's network-admin permission (`NET_ADMIN`).
   - Its settings point it at `ROUTER_HOST=10.8.0.2:8728` with user `mikhmon`.
4. **Database:** the shared `infra-postgres` in Coolify has its own `saleslip` user and database. The server applies any new database changes each time it starts. If that step fails, the old version keeps running.
5. **Secrets:** Paystack keys, the Telegram token and the router password are stored as Coolify secrets or in Infisical. They are not in the code.
6. **Shipping a change:**
   - Push to `main` → GitHub runs the checks → the deploy workflow tells Coolify → Coolify rebuilds the web app and the server.
   - Start manual deploys yourself only when you need to. In the thread, a manual deploy and the automatic one ran at the same time, removed each other's containers and caused a 503 outage.
7. **Watchdog:** the server checks the router every minute and sends you a Telegram message if it's been down for 5 minutes.

---

## Loose ends from the thread

- **Speeds may be the wrong way round.** You asked for 5 down / 3 up, but profiles were set to `5M/3M`, and RouterOS reads that as 5 up / 3 down. The fix would be `rate-limit=3M/5M` on the paid profiles.
- **The login page probably has no ₦200 / 5 GB row**, even though the plan is on sale.
- **Mikhmon's sales reports show old prices.** The on-login scripts still record ₦1,000 and ₦3,000.
- **The tunnel routes added by hand on the VPS** (used to reach the AP) will likely be lost on a restart.
- **The ether2 cable to the AP needs re-crimping.** It dropped 25 times on Oct 15, was dead for 85 minutes, and only links at 100 Mbps.
- **Rotate the passwords in the gist.** It contains the wg-easy admin password, the Postgres admin password and the saleslip database password in plain text. Anyone with the link can read a secret gist.
- **Delete the router's SSH key from the VPS.** It's still at `/tmp/mikrotik_guilders`.
