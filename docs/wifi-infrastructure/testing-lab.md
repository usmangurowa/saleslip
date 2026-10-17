# Testing without a spare MikroTik

The only real router is deployed at Guilders. Don't test on it: reading from it is fine, but never change it. Build and test against MikroTik's virtual router instead. Written on 2026-10-16.

## CHR: the virtual MikroTik

CHR (Cloud Hosted Router) is MikroTik's official RouterOS for virtual machines. It has the same commands, Winbox, REST API, hotspot, RADIUS and WireGuard as the hEX. The free licence caps speed at about 1 Mbps per interface, which is enough for setup testing. A free 60-day trial lifts the cap.

An Android phone can't run RouterOS. Use it as the test customer.

## Three ways to run it

| Setup | Use it for |
|---|---|
| **CHR in a VM on the laptop**: UTM with the ARM64 image on a Mac, VirtualBox or Hyper-V with the x86 image on Windows | The desktop app, hotspot, hosted portal, RADIUS. Give the VM two network cards: one shares the laptop's internet (its "port 1"), the other goes to a USB-Ethernet adapter (its "port 2"). Plug an AP into the adapter and join it with the phone |
| **CHR on a cheap VPS** | A pretend second customer site: tunnel manager, server-side recipes, monitoring, multi-tenant |
| **CHR in Docker** (`docker-routeros`) or started from npm (`quickchr`) | Automated tests locally and in CI: start a clean router, run recipes, check results |

Some people report problems with the ARM64 CHR image under UTM, and the MikroTik forum has a workaround. Budget time for it.

## A working UTM setup (2026-10-16)

Verified end to end on an Apple Silicon Mac (macOS 27, UTM + `chr.aarch64.qemu.7.24.5`):

1. Fresh CHR has **no IP address**. In the UTM console: `/ip dhcp-client add interface=ether1 disabled=no`. UTM's shared network hands out `192.168.64.x`; the router answered on `.2` and the Mac owns `.1` on `bridge101`.
2. First login: `admin`, empty password, set a new one immediately (throwaway password — this router gets factory-reset often).
3. `ping` to the VM fails through UTM's network but **TCP works** — do not conclude the router is down from ping alone. Ports: 22 SSH, 80 WebFig, 8291 Winbox, 8728 classic API (all on by default).

## macOS blocks non-Apple tools from local networks

`node` and Homebrew `python3` get an **instant fake `EHOSTUNREACH` ("No route to host")** connecting to `192.168.64.x`, while Apple's own `nc` and `curl` succeed — same machine, same address, seconds apart. Even Apple's `/usr/bin/python3` fails, so it is not about code signing. Root cause: a **confirmed macOS 27 Local Network privacy regression** (Apple Feedback FB24035385 / FB24085834, Ghostty discussions [#13438](https://github.com/ghostty-org/ghostty/discussions/13438) / [#13476](https://github.com/ghostty-org/ghostty/discussions/13476)) — apps never get the Local Network prompt, never appear in the settings list, and macOS fakes a routing error. Blamed on stale permission caches (`/Library/Preferences/com.apple.networkextension.plist`, `com.apple.networkextension.uuidcache.plist`). Ruled out: Local Network permission toggles, Terminal vs background launch, Tailscale, the application firewall, explicit source binding, and the route table (healthy). Fixes: `sudo` for one-off tests (root bypasses); the confirmed repair is deleting the two plists from Recovery with SIP disabled, then rebooting; otherwise use the relay:

**The `nc` relay** — two Apple-signed `nc` processes pipe for node, which talks to `127.0.0.1` instead:

```sh
FIFO=$(mktemp -u); mkfifo "$FIFO"
(nc -l 127.0.0.1 8729 < "$FIFO" | nc 192.168.64.2 8728 > "$FIFO") &
ROUTER_HOST=127.0.0.1 ROUTER_PORT=8729 ROUTER_API_USER=admin \
  ROUTER_API_PASSWORD=… pnpm --filter @turbo/server routeros:check
kill %1 2>/dev/null; rm -f "$FIFO"
```

With this, the production `@turbo/routeros` client logged in and printed `/system/resource` against CHR — full code path, no production router involved. If `routeros:check` ever fails with `connect to … failed`, run `nc -vz <router-ip> 8728` first: if `nc` succeeds, it is this macOS block, not the router.

**Full voucher lifecycle verified 2026-10-16:** `/system/device-mode/update hotspot=yes` (the API call times out and drops the session, but applies immediately on CHR — no reboot), then profile `1-Day-Unlimited` (`rate-limit=3M/5M`), a voucher minted with the real `@turbo/wifi` generator, hotspot user created/read/relisted/revoked — all through the production service over the relay.

**Captive portal verified 2026-10-16:** pool (`/ip/pool/add`) → `/ip/hotspot/add interface=ether1 address-pool=hs-pool` (servers live under `/ip/hotspot`, created disabled → `/ip/hotspot/enable`). Unauthorized clients get the portal redirect on port 80 and **connection-refused on the API**; a browser login with a minted voucher appeared in `/ip/hotspot/active` (client MAC + pool-assigned address) and `kick()` removed it. Setup order is load-bearing for the desktop app: device-mode → **ip-binding bypassed for the admin machine (by MAC)** → enable the server, or the hotspot locks out all API access and kicks evict the admin too. Kicks do not evict cookied devices (3-day cookie seamlessly continues the same session). Hotspot config-change commands can time out the API session yet still apply — use generous timeouts and confirm by re-printing.

**A real phone as a customer, verified 2026-10-17:** second UTM NIC bridged to the home Wi-Fi = LAN port (`ether2` + hotspot), `ether1` stays WAN with NAT — hotspot must live on LAN only (on WAN it broke the router's own traffic). The phone (static IP, gateway+DNS = router) hit the portal and logged in with a minted voucher; the session showed `http-chap`, `session-time-left` counting down from the profile, and the `saleslip|…` comment. Gotchas: the router needs public DNS or client lookups hang; IPv6 from the home network bypasses the portal (hEX doesn't pass IPv6, so this is lab-only); Chrome's https-first hangs http sites silently — use `http://<router-ip>/login`; vmnet passes no ICMP — test with `/tool/fetch`.

The future desktop app will hit the same wall: expect a macOS **Local Network permission prompt** on first router contact and mention it in the guided setup — but on this Mac the prompt never appeared even for a wrapped `.app`, so verify it on a clean Mac and file a Feedback Assistant report if it doesn't show.

## What CHR can't test

- The device-mode power pull, which behaves differently on a VM
- The hEX's MIPS processor, real ports, real speed under load
- Cables, PoE and the AP link

Buy one cheap real MikroTik (a used hAP lite or hEX lite is enough) before putting the desktop app in front of customers.

## First tests to run

1. The desktop app proof from [setup-without-winbox.md](setup-without-winbox.md).
2. The RADIUS checks from [radius.md](radius.md).

Sources: [CHR on QEMU notes](https://claudeskills.info/skills/aiskillstore/marketplace/routeros-qemu-chr/) · [CHR free licence limit](https://forum.mikrotik.com/t/increase-chr-free-license-limit-to-10-mbit-s/176824) · [CHR on UTM thread](https://forum.mikrotik.com/t/chr-using-apple-virtualization-qemu-for-linux-ready-to-use/173805?page=5) · [docker-routeros](https://awesome.ecosyste.ms/projects/github.com%2Fevilfreelancer%2Fdocker-routeros) · [quickchr](https://cdn.jsdelivr.net/npm/@tikoci/quickchr@0.4.6/README.md)
