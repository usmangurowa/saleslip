# RADIUS

What RADIUS is, how it would work in saleslip, and what to test before relying on it. Written on 2026-10-16 as input to the rebuild. Nothing here is built yet. The decision is recorded as a proposal in `.ai/decisions/ADR-0005-radius-hotspot-auth.md`.

## In plain words

RADIUS is a standard way for a router to ask another computer "is this person allowed in?". Almost every business router and access point supports it, including MikroTik hotspots.

Using the gate comparison from [how-it-works-plain.md](how-it-works-plain.md):

- **Saleslip today:** head office writes every ticket into the gatekeeper's own notebook, through the tunnel. The gatekeeper checks its notebook. If head office can't reach the gatekeeper, the sale gets stuck, and the notebook, the price list and Mikhmon's notes slowly disagree.
- **With RADIUS:** the gatekeeper keeps no notebook. When someone shows a ticket, the gatekeeper phones head office: "Is `SL7KQ2M` valid?" Head office answers "yes: 1 day, 1 GB, 5 Mbps down, 3 Mbps up" or "no". Tickets live only at head office.

## The three jobs

| Job | Plain words | Who starts it | Port |
|---|---|---|---|
| **Authentication** | "Is this code valid, and what are its limits?" | Router asks head office | UDP 1812 |
| **Accounting** | "This user has used 300 MB and 2 hours so far." Sent at login, regularly during use, and at logout | Router tells head office | UDP 1813 |
| **Disconnect / change (CoA)** | "Kick this user now" or "change their speed" | Head office tells router | UDP 3799 |

## What changes compared to today

| Today | With RADIUS |
|---|---|
| Server creates a hotspot user on the router for each sale | Nothing is written to the router. The code exists only in the database |
| Sale gets stuck if the router is unreachable, so a retry ladder is needed | No push step. The code works as soon as payment is confirmed |
| One router profile per plan, typed by hand, with speeds that can be swapped | One default profile. Head office sends the limits with each "yes" |
| Mikhmon on-login scripts set expiry | Head office decides expiry on every login and through accounting |
| Usage visible only by asking the router | Usage arrives at head office by itself, ready for reports and alerts |
| Works on MikroTik only | Same server works for any router or AP brand that supports RADIUS |

## How a login works

1. A phone joins the WiFi. The hotspot sends it to the login page.
2. The customer enters `SL7KQ2M`, or the page enters it for them after payment.
3. The router sends an **Access-Request** to head office: username, password (protected with the shared secret), the phone's MAC address and the router's identity.
4. Head office looks up the code, checks it's paid, not expired, not over its data, and not on too many phones. It answers:
   - **Access-Accept** with the limits, or
   - **Access-Reject** with a reason the login page can show.
5. The router lets the phone in and enforces the limits itself.
6. The router sends **accounting** updates (start, every few minutes, stop). Head office stores usage and can kick the user when the plan runs out.

## The limits head office sends

These are reply attributes inside the Access-Accept. Code builds them from the plan in the database, so nobody types a RouterOS string by hand again.

| Plan field | Attribute | Notes |
|---|---|---|
| Time left | `Session-Timeout` | Seconds until the router logs them out. Head office sends the time left on the plan, not the full plan length |
| Idle logout | `Idle-Timeout` | Logs out phones that went quiet |
| Speed | `Mikrotik-Rate-Limit` | Format `rx/tx` from the router's side, so upload comes first: `3M/5M` means 3 up, 5 down. Build it in one function with a test |
| Data cap | `Mikrotik-Total-Limit` (plus `Mikrotik-Total-Limit-Gigawords` above 4 GB) | Data left on the plan, not the full cap |
| Usage reports | `Acct-Interim-Interval` | How often the router reports usage, e.g. 300 seconds |

Phones per code is checked by head office: if a code already has its allowed number of active sessions in accounting, the next login is rejected.

## Setting it up on a MikroTik

The setup app runs this as one recipe. Shown here so a human can check it.

```
/radius add service=hotspot address=10.8.0.1 secret="…" src-address=10.8.0.2 timeout=3s
/radius incoming set accept=yes port=3799
/ip/hotspot/profile set hsprof1 use-radius=yes radius-accounting=yes radius-interim-update=5m
```

- **Line 1:** "for hotspot logins, ask head office at `10.8.0.1`, over the tunnel."
- **Line 2:** "accept kick and change requests from head office."
- **Line 3:** "this hotspot uses RADIUS, and reports usage every 5 minutes."

The firewall must allow UDP 3799 in from the tunnel only.

## Where RADIUS travels

**Recommendation: send RADIUS inside the WireGuard tunnel.**

- The router starts the tunnel, so it works behind Starlink's shared address.
- WireGuard encrypts it, which fixes classic RADIUS's weak protection.
- Kick and change requests need the tunnel anyway, so one path carries everything.

**Later option: RadSec** (RADIUS over TLS). RouterOS 7 lists `protocol=radsec` for RADIUS servers. It would let logins work for routers without a tunnel, such as other brands. Test it on CHR before depending on it.

## What happens when things break

| Failure | What customers see | Plan |
|---|---|---|
| Head office down or tunnel down | People online stay online until their session ends. New logins fail | Keep a small pool of **offline vouchers** as local hotspot users on the router. MikroTik checks local users before asking RADIUS, so printed slips still work. Confirm this order on CHR |
| Head office slow | Logins take longer | Keep the RADIUS service small and fast: one database lookup per login, no outside calls |
| Router reboots | Sessions end and phones log in again | Cookies and "remember this device" log them back in through RADIUS |
| Kick request not supported for some session type | User stays on until the timeout | `Session-Timeout` and the data limit enforce the plan anyway. Kicking is a bonus |

Forum reports show that MikroTik answers disconnect requests reliably, but some CoA changes (such as changing speed mid-session) get rejected. Test both on CHR before building features on them.

## Which RADIUS server

| Option | For | Against |
|---|---|---|
| **Small RADIUS service in TypeScript** (`apps/radius`, using a Node RADIUS library) | Same codebase, same database package, same tests. Hotspot logins only need PAP/CHAP, not the complex WiFi enterprise methods | You own the protocol code |
| **FreeRADIUS** with its REST module calling `apps/server` | Battle-tested, used everywhere | Another system to configure and run, with its own config language |

**Recommendation:** start with the TypeScript service. Hotspot RADIUS is a small slice of the protocol. Keep FreeRADIUS as the fallback if the library proves weak.

## How to test without a spare router

1. Run a CHR virtual router (see [testing-lab.md](testing-lab.md)).
2. Point it at `apps/radius` on your laptop.
3. Test: accept, reject, wrong password, expired code, data cap reached, too many phones, accounting start/update/stop, disconnect, CoA speed change, and offline vouchers when RADIUS is unreachable.
4. Add the same tests to CI with a Docker CHR image.

## Moving Guilders over

Because the router checks local users before RADIUS, the switch can be gradual:

1. Turn on RADIUS while the existing vouchers stay as local users. They keep working.
2. New sales go through RADIUS only.
3. When the last old voucher expires, delete the old profiles and Mikhmon scripts.

Sources: [MikroTik RADIUS (7.25)](https://manual.mikrotik.com/docs/7.25/authentication-authorization-accounting/radius) · [MikroTik RADIUS (help)](https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS) · [RADIUS client notes](https://mikrotikdocs.fyi/authentication-authorization-accounting/radius-client/) · [CoA forum thread](https://forum.mikrotik.com/t/radius-coa-support/17400) · [Hotspot disconnect-request thread](https://forum.mikrotik.com/t/mikrtik-hotspot-disconnect-request/29857)
