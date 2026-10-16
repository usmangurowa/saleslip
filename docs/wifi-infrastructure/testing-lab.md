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

## What CHR can't test

- The device-mode power pull, which behaves differently on a VM
- The hEX's MIPS processor, real ports, real speed under load
- Cables, PoE and the AP link

Buy one cheap real MikroTik (a used hAP lite or hEX lite is enough) before putting the desktop app in front of customers.

## First tests to run

1. The desktop app proof from [setup-without-winbox.md](setup-without-winbox.md).
2. The RADIUS checks from [radius.md](radius.md).

Sources: [CHR on QEMU notes](https://claudeskills.info/skills/aiskillstore/marketplace/routeros-qemu-chr/) · [CHR free licence limit](https://forum.mikrotik.com/t/increase-chr-free-license-limit-to-10-mbit-s/176824) · [CHR on UTM thread](https://forum.mikrotik.com/t/chr-using-apple-virtualization-qemu-for-linux-ready-to-use/173805?page=5) · [docker-routeros](https://awesome.ecosyste.ms/projects/github.com%2Fevilfreelancer%2Fdocker-routeros) · [quickchr](https://cdn.jsdelivr.net/npm/@tikoci/quickchr@0.4.6/README.md)
