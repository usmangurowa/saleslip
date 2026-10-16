import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SaleslipLogo } from "@/components/saleslip-logo";
import { PlanCard } from "@/components/shop/plan-card";
import { loadShopPlans } from "@/lib/wifi-plans";
import {
  ArrowRight01Icon,
  CreditCardIcon,
  QrCodeIcon,
  Shield01Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@turbo/ui/components/card";
import { Icon } from "@turbo/ui/components/icon";
import { sellablePlans } from "@turbo/wifi";

export const instant = false;

interface Step {
  title: string;
  description: string;
  icon: typeof Wifi01Icon;
}

const steps: Step[] = [
  {
    title: "1. Pick your plan",
    description:
      "From ₦50 for 1 GB to unlimited week and month passes. One device or a shared pack.",
    icon: Wifi01Icon,
  },
  {
    title: "2. Pay with Paystack",
    description:
      "Card, bank transfer, or USSD. Your voucher generates the instant payment confirms.",
    icon: CreditCardIcon,
  },
  {
    title: "3. You're online",
    description:
      "Copy your voucher code or scan the QR code from the captive portal. No login required.",
    icon: QrCodeIcon,
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    mac?: string;
    ip?: string;
    login?: string;
  }>;
}) {
  const { mac, ip, login } = await searchParams;
  const portal = { mac, ip, login };
  const plans = sellablePlans(await loadShopPlans());

  return (
    <div className="bg-background min-h-svh">
      <LandingNav />

      {/* Hero */}
      <main>
        <section className="container flex flex-col items-center gap-6 py-24 text-center md:py-32">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            <span className="bg-success mr-1.5 inline-block size-1.5 rounded-full" />
            Starlink-powered WiFi &middot; pay as you go
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Buy WiFi, go online in seconds.
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-balance">
            High-speed internet in Gombe. Pick a pass, pay securely with
            Paystack, and connect your phone or laptop right away.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button size="lg" asChild>
              <Link href="/buy">
                Get online now
                <Icon icon={ArrowRight01Icon} className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#plans">See plans</a>
            </Button>
          </div>
        </section>

        {/* Plans */}
        <section
          id="plans"
          className="container flex flex-col items-center gap-10 py-16"
        >
          <div className="flex max-w-2xl flex-col items-center gap-3 text-center">
            <span className="text-primary text-sm font-medium tracking-wide uppercase">
              Pricing
            </span>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Choose how long you need
            </h2>
            <p className="text-muted-foreground text-base">
              Day passes come with 1 GB for &#x20a6;50 or 5 GB for &#x20a6;200;
              every plan above them is unlimited data on the Saleslip network.
              Pay once, connect right away.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} portal={portal} />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-border/60 bg-muted/30 border-y py-20">
          <div className="container flex flex-col items-center gap-12">
            <div className="flex max-w-2xl flex-col items-center gap-3 text-center">
              <span className="text-primary text-sm font-medium tracking-wide uppercase">
                Simple
              </span>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                How it works
              </h2>
              <p className="text-muted-foreground text-base">
                Three steps between you and high-speed internet.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {steps.map((step) => (
                <Card key={step.title} className="bg-background/80">
                  <CardHeader>
                    <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                      <Icon icon={step.icon} className="size-5" />
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Starlink badge / Trust banner */}
        <section className="container py-20 text-center">
          <div className="border-border/60 bg-card mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl border p-8 md:p-12">
            <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
              <Icon icon={Shield01Icon} className="size-6" />
            </div>
            <h3 className="text-2xl font-semibold tracking-tight">
              Backed by Starlink low-latency satellite
            </h3>
            <p className="text-muted-foreground max-w-lg text-sm text-balance">
              Fast, reliable connectivity designed for remote work, streaming,
              and video calls in Gombe. Zero throttling during your pass.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-border/60 border-t py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-2">
            <SaleslipLogo className="size-5" />
            <span className="text-sm font-medium">Saleslip</span>
          </div>
          <p className="text-muted-foreground text-sm">
            WiFi in seconds, from &#x20a6;50 a day.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              Operator dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export const metadata: Metadata = {
  title: "Saleslip WiFi — High-speed internet in Gombe",
  description:
    "Buy instant Starlink-powered WiFi access in Gombe. Passes from ₦50. Pay with card, USSD, or transfer.",
};
