# Can the setup app replace Winbox over the Ethernet cable?

Yes. Winbox is only one remote control. The router accepts the same instructions through several other doors, and every one of them works over the cable between the laptop and the router. Anything you can click in Winbox, the app can do through one of these.

## The doors into the router

| Door | What it is, in plain words | When the app uses it |
|---|---|---|
| **REST API** (port 80, RouterOS 7.1+) | Every Winbox menu has a matching web address. The app sends "add this", "change that" as small web requests | The main path for all setup steps |
| **Classic API** (port 8728) | The door `packages/routeros` already uses for vouchers. Also works on old RouterOS 6 routers | Old routers, and as a fallback if the web service is off |
| **SSH + SFTP** (port 22) | A typed terminal, plus file copying | Uploading the login page files, and running raw commands |
| **MAC connection** (MAC-Telnet / MAC-Winbox, UDP 20561) | Talks to the router by its hardware address, so it works even when the router has no IP address or one the laptop can't reach | Rescue only: give the router an address, then switch to REST |
| **Netinstall** | MikroTik's tool that wipes and reinstalls RouterOS over the cable | Bricked routers or forgotten passwords |

Notes on each:

- **REST and the classic API** need their services turned on under `/ip/service`. On a factory router they normally are. If one is off, the app turns it on through another door.
- **MAC connection:** the default config only allows it on the LAN ports ([MikroTik MAC server](https://manual.mikrotik.com/docs/7.25/management-tools/mac-server)), which is one more reason the laptop must be in port 2–5. Sending these packets may need admin rights on the laptop. Test that in the prototype.
- **Netinstall** comes from MikroTik as a Windows app and a Linux command-line tool. As far as I know there is no macOS build, so on a Mac the app would show guided steps instead. Check this before promising it.

## What the cable can't do

1. **The device-mode power pull.** MikroTik requires someone to unplug the router to unlock hotspot and scheduler. This is deliberate and no software gets around it. The app asks once, with an animation, and waits.
2. **Guess the first password.** It's blank on older routers and printed on a sticker on newer ones. The app shows where to find it.
3. **Change the Starlink router.** Bypass Mode is set in the Starlink phone app. The app shows the steps, then checks the result.
4. **Set up every AP brand.** MikroTik APs are automatic. Grandstream, Omada and UniFi need an adapter each. Other brands get a checklist the app then verifies.

## Things to handle in the app

- **Laptop address:** on a default router, the laptop gets a `192.168.88.x` address automatically. If it doesn't, the app sets one by hand or falls back to the MAC connection.
- **Port 1 is closed on purpose.** The default firewall blocks setup from the internet side. The app detects a laptop in port 1 and says "move the cable".
- **Plain HTTP on first contact.** REST over port 80 sends the password unencrypted down the cable. That's acceptable for a direct laptop-to-router cable. The app then creates a certificate and switches to HTTPS (`www-ssl`) or `api-ssl` for everything after.
- **macOS Local Network permission** and the **Windows Firewall prompt** both appear on first run. The app explains them before they pop up.

## How the app is built

An Electron app. Its Node side does all the network work:

- `dgram` listens for MikroTik discovery broadcasts on UDP 5678
- `fetch` calls the REST API
- `ssh2` handles SSH and file uploads
- the existing `packages/routeros` covers the classic API

The setup steps live in a shared `packages/provision`. The server runs the same steps over the WireGuard tunnel after day one.

## First prototype

Before designing screens, build a throwaway proof (about 2–3 days) on a factory-reset hEX:

1. Find the router by its broadcast.
2. Log in with the sticker password over REST.
3. Read the model, version and device-mode.
4. Run one full step: create the hotspot, then check it.
5. Upload a `login.html` over SFTP.
6. Repeat steps 1–3 over the MAC connection on a router with no IP.

If all six work on both Mac and Windows, Winbox is no longer needed for setup.

Sources: [MikroTik services](https://manual.mikrotik.com/docs/7.25/system-information-and-utilities/services) · [MikroTik MAC server](https://manual.mikrotik.com/docs/7.25/management-tools/mac-server) · [Securing your router](https://manual.mikrotik.com/docs/7.25/getting-started/securing-your-router) · [MikroTik ports and MNDP](https://help.mikrotik.com/docs/x/H4AwBg) · [RouterOS REST API](https://mikrotikdocs.fyi/management-tools/rest-api/) · [MikroTik device-mode](https://manual.mikrotik.com/docs/7.25/cli-reference/system/device-mode/)
