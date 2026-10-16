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

## What HotFii teaches us

HotFii supports many brands because it uses RADIUS for logins. That led to a rethink of the rebuild: see [radius.md](radius.md) and [rebuild-architecture.md](rebuild-architecture.md).

Sources: [HotFii](https://hotfii.com)
