# Competitors

What other hotspot software does, and what it means for the rebuild. Researched on 2026-10-16 from public websites only. Nobody has signed up to or tested these products yet.

## HotFii (hotfii.com)

Made by InnoBytes Lab, Nigeria. It sells almost exactly what saleslip plans to, to the same market.

| Area | What they offer |
|---|---|
| Routers | MikroTik first. Claims UniFi, Omada, Ruijie, Cambium, Cisco, Huawei, D-Link ("10+") through RADIUS |
| Setup | Free sandbox sign-up, then paste a generated RouterOS script or RADIUS details. Claims MikroTik setup in under 5 minutes |
| Selling | QR voucher batches, cash sales, agents with commission tracking |
| Payments | Paystack checkout with automatic split payments to the seller's sub-account |
| Control | Live user list, disconnect, data caps, expiry, login page builder, access schedules, device limits |
| Teams | Staff invites, roles, change log |
| Apps | Android. No iOS app linked |
| Price | Sellers: ₦2,500/month up to ₦50,000 sales, then 2% above that. Organisations: ₦5,000/month. ISPs: custom |
| Missing from the site | Starlink, docs, desktop setup app, AP setup |

The site contradicts itself on fees: one section says 2% on every paid activation.

### Where they are ahead

- Live multi-tenant product with sign-up, sandbox and pricing.
- Agent sales with commission, and split payments.
- An Android app.
- Many router brands, because they use RADIUS.

### Where saleslip can win

1. **Starlink first:** dish health (signal, outages, obstructions), Bypass Mode checks, and catching the Starlink WiFi that skips the portal.
2. **No terminal at all:** the desktop app finds the router on the cable and sets it up. A pasted script still needs Winbox and some confidence.
3. **AP setup and checks:** configure the AP and warn when it hands out its own addresses.
4. **Ready kits:** router and AP set up before shipping.
5. **Selling over WhatsApp and Telegram.**

### Pricing takeaway

People in Nigeria already pay around ₦2,500/month plus about 2% for this. Price near that and compete on setup and Starlink monitoring.

### Next step

Sign up for their free sandbox and run their MikroTik script against a CHR virtual router. Note exactly what it changes on the router and how hard each step is for a beginner.

## What is RADIUS?

RADIUS is a standard way for a router to ask another computer "is this person allowed in?". Almost every business router and AP supports it, including MikroTik hotspots.

Using the gate comparison from [how-it-works-plain.md](how-it-works-plain.md):

- **Without RADIUS (saleslip today):** head office writes every ticket into the gatekeeper's own book, through the tunnel. The gatekeeper checks its own book. If head office can't reach the gatekeeper, the sale gets stuck.
- **With RADIUS:** the gatekeeper keeps no book. When someone shows a ticket, the gatekeeper phones head office: "Is `SL7KQ2M` valid?" Head office answers "yes, 1 day, 1 GB, 5 Mbps", or "no". The ticket lives only at head office.

RADIUS does three jobs:

| Job | Plain words | Direction |
|---|---|---|
| **Authentication** | "Is this code valid, and what are its limits?" | Router asks head office |
| **Accounting** | "This user has used 300 MB and 2 hours so far." The router reports usage regularly | Router tells head office |
| **Disconnect / change (CoA)** | "Kick this user now" or "change their speed" | Head office tells router |

### Why it suits Starlink

The first two jobs start from the router. The router can always call out, even behind Starlink's shared address, so logins and usage reports work without the tunnel. Head office also becomes the only place tickets live, which removes a whole class of bugs: no pushing users, no stuck sales, no Mikhmon expiry scripts, no prices drifting apart.

### The catches

1. **Head office must be up.** If the server is down, nobody new can log in. People already online stay online.
2. **Kicking users needs a way in.** The disconnect job comes from head office to the router, so it still needs the WireGuard tunnel, or another path into the router.
3. **Security.** Classic RADIUS only lightly protects its messages. Send it through the WireGuard tunnel, or use RadSec (RADIUS over TLS) where the router supports it.
4. **A RADIUS server to run.** Use FreeRADIUS (free, standard), or a small server inside `apps/server` built on a Node RADIUS library. The second keeps everything in one codebase.

### On a MikroTik

The router-side setup is short:

- add the RADIUS server's address and shared secret under `/radius` for the hotspot service
- turn on `use-radius=yes` in the hotspot profile
- allow incoming disconnect requests with `/radius incoming set accept=yes`

The setup app can do all three as one recipe.

### Recommendation for the rebuild

Use RADIUS for logins and usage. Keep the WireGuard tunnel for kicking users, monitoring, backups and setup changes. Make the decision in an ADR before building, and prototype it against a CHR virtual router first.

Sources: [HotFii](https://hotfii.com)
