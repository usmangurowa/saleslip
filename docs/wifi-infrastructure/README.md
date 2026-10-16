# WiFi infrastructure

How the Guilders Starlink hotspot works today, what went wrong building it, and the plan to rebuild it as a product anyone can set up. Written on 2026-10-16, before the rebuild. Passwords and keys are left out on purpose.

| File | Read it for |
|---|---|
| [how-it-works-plain.md](how-it-works-plain.md) | The whole system in plain words. Every step says what it does. Start here |
| [technical-reference.md](technical-reference.md) | Exact cabling, RouterOS commands, code layout and deployment |
| [mistakes.md](mistakes.md) | 21 things we got wrong, what each causes, and the fix |
| [rebuild-architecture.md](rebuild-architecture.md) | **The current rebuild design**: RADIUS, hosted portal, desired state, multi-tenant, build order |
| [radius.md](radius.md) | What RADIUS is, how saleslip would use it, failure handling, how to move Guilders over |
| [testing-lab.md](testing-lab.md) | Testing without a spare MikroTik: CHR virtual routers on the laptop, a VPS and CI |
| [rebuild-plan.md](rebuild-plan.md) | How to make setup simple, plus the Mac/Windows setup app study and phased roadmap |
| [setup-without-winbox.md](setup-without-winbox.md) | Whether the setup app can control the router over Ethernet without Winbox (yes) |
| [competitors.md](competitors.md) | HotFii and where saleslip can win |

`docs/wifi-platform-plan.md` is the older multi-tenant plan. Where they disagree, these files are newer.

## The goal

Saleslip becomes the software someone uses to run a paid WiFi business on Starlink or any other internet line. They plug a laptop into a MikroTik, click once, set prices, and run the rest from a phone.

## Name ideas for the product

A name for the setup platform as a whole. Keep "Starlink" out of it: SpaceX owns the trademark, and the product should work on any internet line.

| Name | Why |
|---|---|
| **Spotkit** (recommended) | Says what it is: the kit to start a hotspot. Short, easy to say, works with any internet line |
| Gatepass | Matches the ticket-at-the-gate model. Common word, so harder to own |
| Tikiti | Swahili for "ticket". Sounds African and friendly, though less clear to English speakers |
| Linkstand | An internet stall, like a market stand. Fits small shop owners |

Saleslip can stay as the name of the sales and voucher part. A quick web search found no WiFi product using these names, but domains and trademarks still need checking.
