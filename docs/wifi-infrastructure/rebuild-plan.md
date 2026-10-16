# Rebuild plan and the Mac/Windows setup app

How to turn the Guilders setup into a product that a person with basic computer skills can set up alone. Snapshot of research done on 2026-10-16.

The desktop app study here still holds. For how the cloud side works (RADIUS, hosted portal, desired state), [rebuild-architecture.md](rebuild-architecture.md) replaces Part 1 and the build order below.

## Part 1: Making it simple enough for anyone to set up

Today the system only works because you, Copilot and I hand-ran a long list of Winbox, terminal and VPS commands. The fix is to stop treating it as "a router we configure" and treat it as **a product that configures the router**. Six ideas do most of the work.

### 1. One source of truth: the saleslip database
Right now the same facts live in several places and have already drifted apart:
- **Prices:** the `wifi_plan` table, the login page HTML, and the Mikhmon on-login scripts. Those three disagree today: the login page has no ₦200 row, and the reports still record ₦1,000.
- **Speeds:** the router profiles, typed by hand.
- **Brand name:** the print sheet, the login page, the Mikhmon config and the AP.

**Fix:** the owner sets things once in the dashboard (prices, speeds, brand, logo, WiFi name, support phone). Saleslip **generates and pushes** everything else from that: router profiles, the login page, the free sites list (walled garden), voucher sheets and the AP's WiFi name. Nobody edits router files by hand again.

### 2. Saleslip owns the router, so Mikhmon goes
- Today, voucher expiry depends on Mikhmon's on-login scripts, and saleslip assumes Mikhmon's profiles already exist.
- **Fix:** saleslip creates its own profiles and installs its own small, versioned expiry script. Then a new owner never touches Mikhmon, and changing a price never needs a terminal.

### 3. Remote link set up automatically, one per router
Today one wg-easy peer was clicked together by hand, and some VPS routes were added by hand and won't survive a restart.

The server should do all of it:
- give each router its own tunnel address and keys
- connect to the VPS by hostname (`vpn.saleslip.app`), not by IP
- allow each router only its own small address range (now: all of `10.0.0.0/8`)
- keep all routing in the stack's configuration, so restarts change nothing

The owner never sees the word WireGuard.

### 4. Setup becomes "recipes", not commands
A recipe is one named job, such as "Hotspot", "Captive portal", "Remote link", "Plans", "Security" or "Backup". Each recipe has four parts:
- **check:** is it already right?
- **apply:** make it right
- **verify:** prove it worked
- **undo:** put it back

Recipes are safe to re-run, so a half-finished setup just resumes. The dashboard can also spot drift, for example "Your router's speed for *1-Day* doesn't match your plan. [Fix]". That would have caught the swapped speeds.

### 5. A recommended hardware kit
Support "any router + any AP + any ISP" and you'll be doing support forever. Offer a **certified kit**: a MikroTik hEX or hAP plus a MikroTik cAP access point. Every step in that kit is automatic. Other brands still work, just with more guidance (see Part 2).

### 6. Plain-language health and safety
- **Health:** a traffic-light status with no jargon, such as "Internet ✅  Router ✅  WiFi ✅  Payments ✅  Remote link ✅", plus one-tap fixes.
- **Backups:** automatic config backups to the cloud before every change, and nightly.
- **Roles:** Owner, Manager and Cashier. A cashier can print and sell vouchers but can't change prices or router settings.

---

## Part 2: Study of the Mac/Windows setup app

### What it is

**Saleslip Setup** is a small desktop app. The owner plugs a laptop into the MikroTik and clicks **Set up automatically** or **Guide me step by step**. About 10 minutes later the router is a working, remotely managed hotspot. After that, the web dashboard and the phone app do everything; the desktop app is only needed again to repair or replace hardware.

**Why it has to be a desktop app:** a website (saleslip.app) can't talk to `192.168.88.1`. Browsers block public websites from reaching local network devices. A native app can, and it can also listen for MikroTik's discovery broadcasts.

**Key design rule:** the desktop app is only the hands, and the cloud is the brain. All the recipes (Part 1, idea 4) live in one shared TypeScript package, say `packages/provision`, built on your existing `packages/routeros`.
- The desktop app runs the recipes over the cable on day one.
- The server runs the same recipes over the tunnel afterwards.

There is one implementation, so the two can't disagree.

### Tech choice

| | Electron | Tauri |
|---|---|---|
| Reuse your TS packages (`routeros`, `wifi`, `ui`) | Directly | Needs a Node sidecar, or a rewrite in Rust |
| App size | ~100 MB | ~10 MB |
| Speed to build for you | Fastest | Slower |

**Recommendation: Electron for version 1**, because it reuses what's already written. Revisit Tauri if download size starts to matter.

What distribution needs:
- **Mac:** Apple Developer ID (~$99/yr) and notarization.
- **Windows:** a code-signing certificate (for example Azure Trusted Signing).
- Auto-updates.
- **macOS 15+ Local Network permission:** the app must ask for it and explain why. Developers report the permission prompt sometimes doesn't appear, so build a "Fix permission" help screen ([Apple forums](https://developer.apple.com/forums/thread/765285)).
- **Windows Firewall:** expect a one-time prompt to allow the app on the network.

### Step 1: Find the router

1. The app says: **"Plug your laptop into port 2 (not port 1)."** It shows a picture of the router model.
2. It finds the router three ways, all automatic:
   - **Discovery broadcasts:** MikroTik routers announce their name, model, version and MAC address on UDP port 5678 every 60 seconds ([MikroTik ports](https://help.mikrotik.com/docs/x/H4AwBg)). This is how Winbox finds routers.
   - **Laptop address:** if the laptop got a `192.168.88.x` address, it's on the right port.
   - **Direct check:** try `192.168.88.1`.
3. **If nothing is found:** wrong port, router never configured, or a non-MikroTik device. The app shows a fix-it card such as "Move the cable to port 2" or "Reset the router: hold the button for 5 seconds".
   - Advanced, for later: MAC-level access on UDP 20561, which works with no IP address, and Netinstall for bricked routers.

### Step 2: Log in and take over safely

1. **Login:** user `admin` with either a blank password (older units) or the password printed on the sticker (newer units). The app explains where the sticker is and warns about 0 vs O ([MikroTik default passwords](https://manual.mikrotik.com/docs/getting-started/configuration-management/default-configuration-passwords)).
2. **Takeover:**
   - Create a dedicated `saleslip` admin user and set a new admin password.
   - Store both in the OS keychain and the saleslip cloud vault, so the owner can't lose them.
3. **Pre-checks:**
   - Model and CPU type.
   - RouterOS version: offer a one-click upgrade if it's below 7.
   - Free storage.
   - Does the router already have a config? If it does, offer "Keep my settings" or "Start clean (recommended)". Start clean is a reset to the default config.
4. **Talking to the router:** use the RouterOS **REST API** (RouterOS 7.1+, served by the router's built-in web service, so it works on a fresh router) or the existing API client. Use SSH/SFTP for uploading portal files.

### Step 3: Device-mode, the one physical step

- New routers block hotspot, scheduler and fetch. The app sends one command, `/system/device-mode/update mode=advanced`. That command replaces all device-mode settings, which is fine on a fresh router ([MikroTik docs](https://manual.mikrotik.com/docs/7.25/cli-reference/system/device-mode/)).
- **The physical part can't be automated**, on purpose: RouterOS needs a power cut or button press within ~5 minutes to confirm. So the app shows a big animation: **"Unplug the router's power, count to 5, plug it back."** It waits, finds the router again, and confirms the change.
- Because this is done once, with everything enabled at the same time, it's the only time the owner has to touch the router.

### Step 4: The recipes

These are the cards in Guided mode. Automate runs the same list in order, pausing only for physical actions.

| Card | What the app does | What the owner sees |
|---|---|---|
| **Internet** | Checks the internet port; spots Starlink (dish status at `192.168.100.1`) and double NAT, i.e. a `192.168.1.x` address on the internet port | "Starlink found ✅. Tip: turn on Bypass Mode [show me how]" |
| **Local network** | LAN, DHCP and DNS; turns on rogue-DHCP alerts | Nothing to choose |
| **Hotspot** | Address pool, hotspot profile and server on the bridge; trial settings; cookie lifetime | "Free trial: [5 min ▾] per day" |
| **Captive portal** | Owner picks a theme, logo and colours; the app builds the login page from DB plans and uploads it | Live preview of the phone screen |
| **After-login page** | Generated status/after-login page: "You're online", time and data left, a redirect choice (receipt, WhatsApp channel, own site) | "After login, send customers to: [ ▾ ]" |
| **Free sites (walled garden)** | Adds saleslip, the payment provider (Paystack and others) and Telegram/WhatsApp automatically | Nothing to choose |
| **Plans & prices** | Creates profiles plus the expiry script from simple fields | "Name / Price / Download / Upload / Data / Valid for / Devices" |
| **Remote link** | Server issues a tunnel identity → app installs it → waits for the handshake | "Connected to cloud ✅" |
| **Security** | Locks the API, Winbox and SSH to LAN and tunnel only; turns off unused services; blocks access from the internet port; sets NTP and Lagos time | Nothing to choose |
| **Backup & test** | Saves a backup to the cloud; makes a test voucher the owner tries on their phone | "Scan this QR with your phone, log in, done ✅" |

**Safety net for every change:**
- Back up first.
- Install an **auto-undo timer** on the router: "restore the backup in 10 minutes unless the app cancels". RouterOS's API has no "safe mode", so this timer does that job; it's why the scheduler must be on.
- If a step breaks the connection, the router reverts itself.
- Every step is safe to re-run.

### Step 5: Access points and the Starlink router

The app sorts the AP into one of three tiers. It identifies the AP from the DHCP lease (manufacturer prefix of the MAC address) and the router's neighbour list (LLDP/MNDP).

| Tier | Brands | How |
|---|---|---|
| **1. Automatic** | MikroTik cAP / hAP | The hEX manages it centrally (CAPsMAN): WiFi name, Open security, client isolation, channel, all pushed. Zero touches. Confirm CAPsMAN support on the hEX for the newer `wifi` APs during prototyping |
| **2. Adapter** | Grandstream GWN (local API, as we used on yours), TP-Link Omada (controller OpenAPI), Ubiquiti UniFi (controller API) | Owner enters the AP's admin password once, and the app sets the name, Open security, bridge mode, DHCP off and country. Build one adapter at a time, starting with brands your customers already own (Grandstream first) |
| **3. Guided + verified** | MTN/consumer routers and anything else | Illustrated checklist ("Turn off DHCP, set AP mode, name the WiFi…") followed by **automatic checks** (below) |

**Automatic checks that catch common mistakes:**
- **Second DHCP server on the network:** the AP is in router mode, so its users never see the portal. Detected with rogue-DHCP alerts.
- **Phones getting addresses outside `192.168.88.x`:** same problem, seen from the leases.
- **Laptop WiFi scan** (the laptop can see nearby networks):
  - "`STARLINK-xxxx` is visible. Customers can skip your portal. [How to fix]"
  - "`Guilders Starlink` is open ✅"

**The Starlink router itself:**
- There's no official API for changing its settings, so the app can't switch it to Bypass Mode. It guides the owner with screenshots of the Starlink app instead.
- It then **verifies** the result: no double NAT and no Starlink WiFi visible.
- For monitoring, the dish answers status requests (signal, outages, obstructions) on its local gRPC interface, `192.168.100.1:9200`. It's unofficial but widely used ([starlink-grpc-tools](https://github.com/sparky8512/starlink-grpc-tools)).

### Step 6: Day two, web and phone

After setup, everything runs through the tunnel. Your existing `apps/web` dashboard covers most of this, and `apps/mobile` becomes the phone app:

- **Monitor:**
  - router online, CPU and memory
  - internet up/down, speed and Starlink signal
  - AP online (the router pings it and reports drops; this would have caught the ether2 outage within a minute)
  - active users, live traffic per user
  - sales today, best-selling plans
- **Act:** kick users, make or print vouchers, change prices (pushed to the router automatically), restart the router or AP, restore a backup.
- **Alerts:** phone push, Telegram or WhatsApp, for example:
  - "Router offline 5 min"
  - "AP dropped 3 times today, check cable"
  - "Router is at 90% CPU with 48 users, consider an upgrade"
  - "Payment received but voucher failed"
- **Cashier mode** on the phone: sell, print or share a voucher by WhatsApp, record cash sales.

### What the cloud needs before the app is worth building

1. **Multi-tenant:** businesses, staff roles and routers in the DB, plus a Paystack subaccount per business. The plan doc already designs this.
2. **Tunnel manager:** the server allocates tunnel addresses and keys per router (the plan doc's `10.20.0.0/16` range) and keeps routing in the stack config.
   - Don't use MikroTik's own **Back To Home** relay. It needs ARM/ARM64/TILE hardware ([MikroTik BTH](https://manual.mikrotik.com/docs/network-management/cloud/back-to-home)), and the hEX RB750Gr3 is MIPS. It's also built for phones to dial home, not for a SaaS to manage routers.
3. **`packages/provision`:** the recipe engine, shared by desktop and server.
4. **Monitoring store:** periodic snapshots in Postgres, plus a job queue for alerts and retries.

### Suggested order

| Phase | What | Rough size |
|---|---|---|
| **A** | Clean up [mistakes.md](mistakes.md) items 1–7; saleslip creates its own profiles and portal from the DB; Mikhmon retired | 1–2 weeks |
| **B** | Multi-tenant, tunnel manager, recipes running from the server (onboarding a router that already has a tunnel) | 2–3 weeks |
| **C** | Desktop app v1: discover, log in, device-mode, Automate/Guided, **MikroTik-only kit** | 3–4 weeks |
| **D** | AP adapters (Grandstream, then Omada), Starlink checks, WiFi scan | 2–3 weeks |
| **E** | Phone app (owner + cashier), alerts, capacity advice | 2–3 weeks |

The estimates are guesses for one person working with agents.

### Biggest risks

- **The physical power-cycle can't be avoided.** Make that one step foolproof with a good animation.
- **Every AP brand is its own integration.** The certified kit keeps support manageable.
- **Sticker passwords get lost or misread.** Have a "can't log in? reset the router" path ready.
- **Existing router configs vary wildly.** Make "Start clean" the default.
- **Starlink's commercial-use terms.** See the note at the end of [mistakes.md](mistakes.md).

**An easier option to offer alongside:** sell **pre-configured kits**. You run the Setup app on the router and AP before shipping, so the owner only plugs in cables and sets prices on their phone. That's essentially what you did for Guilders, made repeatable.

---

**Sources:** [MikroTik device-mode](https://manual.mikrotik.com/docs/7.25/cli-reference/system/device-mode/) · [MikroTik device-mode (help)](https://help.mikrotik.com/docs/display/ROS/Device-mode) · [MikroTik ports / MNDP](https://help.mikrotik.com/docs/x/H4AwBg) · [MNDP UDP 5678](https://wiert.me/2017/08/14/mikrotik-udp-port-5678-usage-is-for-mikrotik-neighbor-discovery-protocol-mndp/) · [RouterOS REST API](https://mikrotikdocs.fyi/management-tools/rest-api/) · [Default passwords](https://manual.mikrotik.com/docs/getting-started/configuration-management/default-configuration-passwords) · [Back To Home](https://manual.mikrotik.com/docs/network-management/cloud/back-to-home) · [hEX hotspot throughput thread](https://forum.mikrotik.com/t/hex-rb750gr3-low-throughput-with-starlink-gen3-23mbps-fetch-but-10-14mbps-on-ether1-with-55-hotspot-clients/270387) · [macOS local network permission](https://developer.apple.com/forums/thread/765285) · [Omada OpenAPI SSID thread](https://community.tp-link.com/en/business/threads/topic/867976) · [starlink-grpc-tools](https://github.com/sparky8512/starlink-grpc-tools)
