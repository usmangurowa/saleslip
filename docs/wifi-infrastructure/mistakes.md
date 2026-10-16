# Mistakes to fix

What we got wrong in the first build, what it causes and how to fix it. The plain-words version is Part F of [how-it-works-plain.md](how-it-works-plain.md).

| # | What happened | What it causes | Fix |
|---|---|---|---|
| 1 | Passwords pasted into chat and the gist: wg-easy admin, Postgres root, the saleslip DB password, the AP admin password | Anyone with the link can take over the VPN, the database and the AP | Rotate all of them now. Keep secrets only in Infisical or Coolify, and redact exports before sharing |
| 2 | Prices kept in three places (DB, login page, on-login scripts) | The ₦200 plan is missing from the portal, and Mikhmon reports old prices | Generate the login page and scripts from the DB ([rebuild-plan.md](rebuild-plan.md), Part 1, idea 1) |
| 3 | Speed limit typed as `5M/3M` | Customers get 5 up / 3 down, the opposite of what you asked for | Set speeds as "download / upload" fields in the dashboard and let code build the RouterOS string |
| 4 | Saleslip depends on Mikhmon profiles and scripts | Prices and expiry live outside your app, and Mikhmon can't be removed | Saleslip creates its own profiles and expiry script |
| 5 | Hand-made VPS routes (`ip route replace…`, `wg set…`) | A restart quietly breaks the path to the AP | Put routing in the stack config, or have the server manage it |
| 6 | Router SSH key left at `/tmp/mikrotik_guilders` on the VPS, and the SSH key added to the router three times | Anyone on the VPS can log in to the router as admin | Delete it, and use a dedicated, limited `saleslip` user |
| 7 | One broad firewall rule: accept anything from `10.0.0.0/8` | Every future tunnel client, and any other tenant later, can reach the router | Accept only the VPS address, and only the needed ports |
| 8 | Starlink router WiFi still on, only hidden and password-protected | Anyone with that password gets free, unlimited internet | Use Bypass Mode, or at least keep that password very private |
| 9 | Too many domains: `usmangurowa.dev`, `saleslip.app`, `wifi.`, `api.`, `buy.` | Walled-garden gaps, cookie problems (ADR-0004), confusion | Use one domain plan: `saleslip.app`, `api.`, `vpn.`, `portal.` |
| 10 | Brand hardcoded ("Guilders Starlink" and a phone number in the print sheet) | Can't onboard a second business | Read brand settings from the tenant record |
| 11 | Everything is single-tenant (router and Paystack set by env vars) | Every new customer means a new deployment | Tenants, a router table and per-tenant Paystack subaccounts, as in the plan doc |
| 12 | Manual deploys running alongside auto-deploys | Both deploys removed each other's containers, and the API returned 503 | Deploy only through the CI workflow |
| 13 | Device-mode turned on in two separate power-cycles | Two trips to unplug the router, and remote setup becomes impossible | Do it in one step with `mode=advanced`, which turns on hotspot, scheduler and fetch together ([MikroTik docs](https://manual.mikrotik.com/docs/7.25/cli-reference/system/device-mode/)) |
| 14 | The plan's one-line `/tool fetch` setup | It would fail: home mode also has `fetch: no` | Turn device-mode on first, or push files over SSH or the REST API |
| 15 | Hotspot DNS name cleared to fix the `router.lan` error | Works, but the login runs on a bare IP over plain http, and status/logout pages are flaky | Use a real hostname you own for the portal (e.g. `login.saleslip.app`), with a proper certificate later |
| 16 | No regular backups | A factory reset loses the tunnel and every voucher | Nightly `/export` and `/system backup` pulled to the cloud |
| 17 | ~80 m outdoor cable to the AP, badly crimped | 25 drops and 85 minutes offline; links at only 100 Mbps | Re-crimp, use outdoor-rated cable with a surge protector, and alert when the AP goes offline |
| 18 | Capacity not planned | The hEX hotspot gets slow with many users ([forum report](https://forum.mikrotik.com/t/hex-rb750gr3-low-throughput-with-starlink-gen3-23mbps-fetch-but-10-14mbps-on-ether1-with-55-hotspot-clients/270387)) | Show live CPU and user count; recommend a bigger router above ~40 users |
| 19 | Stale docs: `tech-stack.md` still names `node-routeros`, and the plan doc still describes the old code format | Future agents and contributors get misled | Update them when the code changes |
| 20 | The mobile app is still template code | No phone monitoring | Turn it into the owner/cashier app ([rebuild-plan.md](rebuild-plan.md), Part 2, Step 6) |
| 21 | Voucher QR only joins the WiFi | Customers still type the code | Fine for now. Later, a status page that auto-fills the code |

One business risk to check: **Starlink's residential terms may not allow reselling access.** A Business or "Local Priority" plan may be needed for a commercial hotspot. Confirm before you scale this to other customers.
