# How it works, in plain words

Snapshot of the Guilders Starlink setup as of 2026-10-16. Every step says what it does, using one comparison throughout. For the exact commands and code, see [technical-reference.md](technical-reference.md).

I've rewritten everything using one comparison throughout, so each step can be pictured. Your goal, making saleslip the go-to software for anyone reselling Starlink internet, is kept in mind the whole way.

## The comparison: an event with a gate

Your WiFi business works like a **paid event**:

| Real thing | What it is in the comparison |
|---|---|
| **Starlink** | The water main: where the internet comes from |
| **MikroTik router** | The **gatekeeper** at the entrance. Nobody gets in without a ticket |
| **Access point (AP)** | The **loudspeaker / radio mast** that lets phones hear and join the WiFi. It doesn't check tickets; it just broadcasts |
| **Captive portal** (login page) | The **ticket window**: the page that pops up asking for a code |
| **Voucher** | The **ticket**: a code like `SL7KQ2M` |
| **Profile / plan** | The **ticket type**: "1 day", "1 GB", "1 week", with its rules (speed, how many phones) |
| **VPS** (your online server) | **Head office**: a computer in a data centre that's always on |
| **WireGuard tunnel** | A **private phone line** the gatekeeper keeps open to head office |
| **Saleslip** | **Head office staff**: sells tickets, takes money, tells the gatekeeper who's allowed in |
| **Mikhmon** | An old, borrowed office clerk we used before saleslip could do the job |
| **Paystack** | The **cashier** that takes the customer's money |
| **Database** | The **ledger book** at head office: every plan, sale and ticket |

A few terms you'll keep seeing:

- **IP address:** a house number on a network. `192.168.88.1` is the gatekeeper's house number inside your venue.
- **Port:** a socket on the router where a cable plugs in. **Port 1** = internet in. **Ports 2–5** = your venue side.
- **Winbox:** MikroTik's remote-control app for your laptop.
- **Terminal:** the box inside Winbox where you type instructions to the router.
- **DHCP:** the usher who gives each arriving phone a seat number (IP address) automatically.

---

# Part A: How we set it up, step by step

### Step 1: Plug the cables
- **Done:** Starlink router → MikroTik **port 1**. MikroTik **port 2** → PoE box → access point. Laptop → spare port.
- **What it means:** water goes in one side of the gatekeeper; the venue sits on the other side. Every phone's traffic now has to pass the gatekeeper. The **PoE box** sends power down the same cable as the internet, so the AP on the pole needs no separate power socket.

### Step 2: Open Winbox and connect to `192.168.88.1`
- **What it means:** you pick up the remote control and point it at the gatekeeper's house number. Logging in as `admin` = showing the gatekeeper you're the boss.

### Step 3: Unlock the hotspot feature
```
/system/device-mode/update hotspot=yes
```
- **What it means:** new MikroTik routers come with some features **locked at the factory** for safety. "Hotspot" (ticket checking) was one of them. This command asks for it to be unlocked.
- **Why pull the power plug:** MikroTik makes you prove you're standing next to the router. Only someone physically there can unplug it, so a hacker on the internet can't unlock features. The **power cut is the "yes, it's really me" signature.**

### Step 4: Unlock the scheduler (second power pull)
```
/system/device-mode/update scheduler=yes
```
- **What it means:** the scheduler is the gatekeeper's **alarm clock**. It's what says "this 1-day ticket expires tomorrow at 3pm, kick them out". Without it, tickets would never expire.
- **What we got wrong:** we did steps 3 and 4 separately (two power pulls). One command can unlock both at once.

### Step 5: Test the login page
- **Done:** on the laptop, opened `http://neverssl.com`. The login page appeared.
- **What it means:** we walked up to the gate without a ticket, and the gatekeeper correctly sent us to the ticket window.
- **Why "http" and not "https":** secure (https) websites refuse to be redirected, so the ticket window can't pop up on them. A plain http site lets the gatekeeper step in.

### Step 6: Set up head office (the VPS) with Coolify
- **Done:** on your online server, Coolify started two programs: **wg-easy** (`vpn.usmangurowa.dev`) and **Mikhmon** (`wifi.usmangurowa.dev`).
- **What it means:** Coolify is the **building manager** of head office. It starts programs, keeps them running and gives each one a web address. We hired two staff: the **phone-line operator** (wg-easy) and the **clerk** (Mikhmon).

### Step 7: The problem: head office can't call the gatekeeper
- **What it means:** Starlink doesn't give your router its own public phone number. Many customers share one number (this is called **CGNAT**), like a hostel where everyone shares the front desk number. Head office can't dial in directly.
- **The solution:** the gatekeeper calls head office instead, and never hangs up. That's the tunnel.

### Step 8: Create the private phone line (WireGuard)
In wg-easy we created a "client" called `mikrotik-hotspot`. On the router:
```
/interface/wireguard add name=wireguard1 private-key="…"
/interface/wireguard/peers add … endpoint-address=195.179.227.24 endpoint-port=51820 persistent-keepalive=25s
/ip/address add address=10.8.0.2/24 interface=wireguard1
/ip/route add dst-address=10.0.0.0/8 gateway=wireguard1
```
Line by line:
- **Line 1:** install a private phone on the gatekeeper's desk. The **private key** is its secret password.
- **Line 2:** tell it head office's number (`195.179.227.24`). **Keepalive 25s** = "say hello every 25 seconds so the line never drops".
- **Line 3:** give the gatekeeper an **internal extension number**, `10.8.0.2`. Head office always calls this extension. It never changes, even if Starlink changes the router's outside number or you move the box to another state.
- **Line 4:** "anything for head office goes down the private line."

**Check it works:** `last-handshake` = "last time both sides said hello". If it shows a recent time, the line is live.

### Step 9: Let head office's calls through the router's firewall
```
/ip/firewall/filter add chain=input in-interface=wireguard1 src-address=10.0.0.0/8 action=accept
```
- **What it means:** the router has a **bouncer** for itself (the firewall). This tells the bouncer: "calls coming over the private line are allowed."
- **What we got wrong:** we allowed a very wide range of extensions (`10.0.0.0/8`). It should allow only head office.

### Step 10: Give head office its own login on the router
```
/user/group add name=api-mgmt policy=api,read,write,test,sensitive
/user add name=mikhmon group=api-mgmt password="…"
/ip/service set api disabled=no address=10.0.0.0/8
```
- **Line 1:** create a **job role** that can read and change hotspot settings, but isn't the full boss.
- **Line 2:** create a **staff badge** called `mikhmon` with that role.
- **Line 3:** open the **staff entrance** (the "API", a door built for programs rather than humans), and only for callers on the private line.

Both Mikhmon and saleslip use this staff badge.

### Step 11: Connect Mikhmon to the router
- **Done:** in Mikhmon we added router IP `10.8.0.2`, user `mikhmon`, then Save → Connect.
- **What it means:** we gave the clerk the gatekeeper's extension and the staff badge. Now the clerk can create tickets from head office.

### Step 12: Create ticket types (profiles) in Mikhmon
Each profile holds a few settings:
- **Rate limit** = the speed of the tap per customer.
- **Shared users** = how many phones one ticket can use at once.
- **Validity** = how long the ticket lasts from first use.
- **Price** = for the sales records.

Mikhmon also attached a tiny **on-login script** to each profile. It's a note pinned to the ticket type: "when someone first uses this ticket, write down the expiry time and set the alarm clock."

### Step 13: Remote Winbox from your laptop
- **What it means:** we gave your laptop its own private phone line too (a second wg-easy client). Now your remote control works from anywhere in the world, by dialling extension `10.8.0.2`.

### Step 14: The WiFi problem we found
- **The problem:** the hEX has **no WiFi of its own**. The only WiFi was the **Starlink router's**, which sits *before* the gatekeeper. Phones on it walked around the gate entirely. Free internet for everyone.
- **The fix:**
  - Put the **AP after the gatekeeper** (port 2) and name it **"Guilders Starlink"**.
  - Give the AP **no password**: the ticket is the password, like hotel WiFi.
  - Put the AP in **bridge mode**: it only broadcasts, and lets the gatekeeper hand out seat numbers.
  - Hide the Starlink router's own WiFi and give it a strong password, so it becomes your private back door.

### Step 15: The "free zone" (walled garden)
```
/ip/hotspot/walled-garden add dst-host=*.saleslip.app
/ip/hotspot/walled-garden add dst-host=*.paystack.com
…
```
- **What it means:** people without a ticket still need to reach the ticket shop and the cashier. These lines say "these websites are allowed before paying." Without them, nobody could buy a ticket from their phone.

### Step 16: Custom login page
- **Done:** we replaced the router's file `flash/hotspot/login.html` with a branded page that has a code box, a free 5-minute trial button and price buttons linking to saleslip.
- **What it means:** we redesigned the ticket window and put a "buy a ticket" button on it.

### Step 17: Fixes from the later thread
- **Phones showing "router.lan not found":**
  - Some phones use their own private address-lookup service (Private DNS), so they couldn't find the gatekeeper by the name `router.lan`.
  - Removing the name made the login page open by house number instead.
- **AP and laptop "bypassed":** we told the gatekeeper "these two devices never need a ticket". That way the AP's own settings page and your laptop stay reachable.
- **AP renamed to "Guilders Starlink"** remotely, through the private line.

---

# Part B: What happens when someone buys a ticket

1. **The phone joins "Guilders Starlink" and the login page pops up.** The gatekeeper stopped them and pointed to the ticket window.
2. **They tap a price (or use the Telegram bot).** Saleslip writes a "waiting for payment" line in the ledger.
3. **Paystack takes the money.** The cashier collects by bank transfer, USSD or card.
4. **Paystack tells saleslip "paid".** This message is a **webhook**: the cashier ringing head office directly. We only trust that call, not the customer saying "I paid".
5. **Saleslip makes a code (`SL…`) and calls the gatekeeper over the private line:** "allow this code, 1-day ticket type, 1 GB limit." The ticket now exists on the router.
   - **If the router doesn't answer:** saleslip tries again after 5 seconds, 30 seconds, 2 minutes, 10 minutes and 30 minutes.
6. **The customer gets the code** on screen, by Telegram or by email, and types it in. They're online.
7. **When the ticket's time is up,** the alarm clock (scheduler) goes off and the gatekeeper removes it.

**Counter sales:** the dashboard makes many tickets at once and prints them on A4. The QR code on each slip joins the WiFi for you; it doesn't log you in.

# Part C: How saleslip runs and gets updated

1. **The website, the shop/server and the database** all run at head office, under the building manager (Coolify).
2. **Shipping a change:** when code is pushed to `main` on GitHub, an automatic checker tests it. If it passes, Coolify is told to rebuild and restart.
3. **Database updates:** whenever the server starts, it updates the ledger's layout if needed (these updates are called migrations). If that fails, the old version keeps running, so nothing breaks.
4. **Passwords and keys** (Paystack, Telegram, router password) sit in a **locked drawer** (Infisical or Coolify secrets), never in the code.
5. **The server's route to the router:** when it starts, it adds one rule, "calls for the router go via the phone-line operator (wg-easy)". That's how it reaches `10.8.0.2`.
6. **Watchdog:** every minute the server checks "is the gatekeeper answering?". If not for 5 minutes, it sends you a Telegram message.

---

# Part D: Saleslip as the go-to Starlink reseller software

**The idea in one line:** anyone with a Starlink and a MikroTik can open saleslip, plug in, and run a WiFi business without knowing any of the words above.

### What it does for a reseller

1. **Set up:** plug the laptop in, click one button. Saleslip prepares the gatekeeper, the AP and the private line.
2. **Sell:** online shop, Telegram/WhatsApp bot, printed slips, cashier app on a phone.
3. **Collect money:** Paystack pays the reseller's own bank account directly. Saleslip takes a small fee.
4. **Watch:**
   - Is the internet up?
   - Is the AP up?
   - How many people are online?
   - How much was sold today?
   - Is the dish blocked by a tree?
5. **Fix:** one-tap repairs, automatic backups, alerts on the phone.
6. **Grow:** many sites, many routers, staff accounts (owner / manager / cashier).

### The rules that make it simple

1. **One ledger rules everything.** The owner types prices, speeds and the WiFi name once in saleslip. Saleslip updates the router, the login page and the AP itself.
   - **Why:** today prices live in three places and already disagree. The ₦200 plan is missing from the login page, and reports show old prices.
2. **Saleslip replaces Mikhmon completely.** No borrowed clerk; saleslip makes its own ticket types and alarm-clock notes.
3. **Private lines are installed automatically.** One per router, with no clicking in wg-easy.
4. **Every setup task is a "recipe" that checks itself.** Each recipe asks: is it already right? If not, fix it, then prove it worked, and undo it if something breaks.
   - **Why:** this would have caught the swapped speed setting.
5. **A recommended kit:** MikroTik router + MikroTik AP. With that combination, everything is automatic.
6. **Traffic-light health screen:** "Internet ✅ Router ✅ WiFi ✅ Payments ✅".

---

# Part E: The Mac/Windows setup app, step by step

**Why a desktop app at all:** a website can't talk to devices on your local cables, because browsers block that for safety. An app on the laptop can.

1. **"Plug your laptop into port 2."** Port 1 is the internet side, and the router blocks setup from there.
2. **The app finds the router.**
   - MikroTik routers shout "I'm here!" on the cable every minute. The app listens for that shout.
   - It also checks whether the laptop got a `192.168.88.x` seat number, which proves the cable is in the right port.
3. **Log in.** The password is blank on older routers, or printed on a sticker on newer ones. The app shows where the sticker is.
4. **Take over safely.** The app creates its own staff badge and a new boss password, then saves them in the laptop's password vault and in saleslip, so the owner can't lose them.
5. **Health check.** Which model is it, is its software new enough, does it already have settings? Offer "start clean (recommended)".
6. **Unlock features: one power pull.** The app sends a single unlock command, then shows an animation: "Unplug the power, count to 5, plug it back." It waits and confirms. This is the only physical step, and nobody can skip it, because it's MikroTik's "prove you're here" rule.
7. **Run the recipes.** In **Guided** mode each one is a card with an explanation and an "Apply" button; **Automate** runs them all in a row:
   - **Internet:** checks the Starlink connection is working. If the Starlink router is still acting as a router (double gate), it says "Turn on Bypass Mode, here's how" with pictures.
   - **Local network:** sets up the usher (DHCP) so phones get seat numbers.
   - **Hotspot:** turns on ticket checking and sets the free-trial length.
   - **Login page:** the owner picks colours and a logo and sees a phone preview. The app uploads it.
   - **After-login page:** "You're online, here's your time left", plus where to send customers next.
   - **Free zone:** automatically allows the shop and payment sites.
   - **Plans and prices:** simple boxes for name, price, download speed, upload speed, data, days and phones. No `5M/3M` codes, so speeds can't get swapped.
   - **Private line:** installs the tunnel and waits for head office to say "connected ✅".
   - **Security:** closes all the doors except the staff entrance from head office.
   - **Backup and test:** saves a copy of the settings online, then makes a test ticket. "Scan this with your phone and log in."
8. **Safety net.** Before every change the app saves a backup and sets a **10-minute auto-undo alarm** on the router. If a change cuts the connection, the router puts itself back the way it was. Like saving a game before a hard level.
9. **The AP:**
   - **MikroTik AP:** the router configures it automatically.
   - **Grandstream / TP-Link / Ubiquiti:** the owner types the AP's password once and the app sets it up.
   - **Any other brand:** a picture checklist, then the app **checks the work**.
     - "Your AP is handing out its own seat numbers, so customers will skip the gate. Turn off DHCP."
     - Using the laptop's WiFi: "I can still see `STARLINK-xxxx`. Customers can skip your gate. Hide it or turn it off."
10. **Done.** From now on, the web dashboard and the phone app do everything through the private line. The desktop app is only needed for repairs or new hardware.

---

# Part F: What we did wrong, in plain words

1. **Passwords shared in chats and the gist.** Anyone with the link can get into the private-line admin, the database and the AP. **Change them all.**
2. **Prices written in three places,** and they disagree.
3. **Speed set backwards:** customers got 5 up / 3 down instead of 5 down / 3 up.
4. **Saleslip still leans on Mikhmon** for ticket expiry.
5. **Hand-made fixes at head office** (routes to the AP) will vanish on the next restart.
6. **A router key left lying on the server.** Anyone there can log in to your router as boss.
7. **The firewall door is too wide.** It trusts a huge range of extensions instead of just head office.
8. **The Starlink router's WiFi still exists.** Hidden, but anyone with the password skips the gate.
9. **Too many web addresses** (`usmangurowa.dev`, `saleslip.app`, `wifi.`, `api.`, `buy.`). That causes gaps in the free zone and login problems.
10. **Two power pulls** when one would do.
11. **No automatic backups.** A factory reset would wipe the private line and every ticket.
12. **A weak 80 m cable to the AP.** It dropped 25 times. Re-crimp it, and add an alert when the AP goes offline.
13. **Guilders' name and phone number are written into the code,** so a second business can't use it yet.
14. **Two deploys at once** knocked the site offline.
15. **No capacity warning.** The hEX slows down with many users, so saleslip should warn before that happens.
16. **Starlink's rules:** check whether your Starlink plan allows reselling internet. A Business plan may be required.
