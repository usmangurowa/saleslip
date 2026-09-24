import type { IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SaleslipLogo } from "@/components/saleslip-logo";
import { PlanCard } from "@/components/shop/plan-card";
import {
  ArrowRight01Icon,
  CreditCardIcon,
  QrCodeIcon,
  Router01Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@turbo/ui/components/card";
import { Icon } from "@turbo/ui/components/icon";
import { buildPlans } from "@turbo/wifi";

const plans = buildPlans();

interface Step {
  title: string;
  description: string;
  icon: IconSvgElement;
}

const steps: Step[] = [
  {
    title: "Pick a plan",
    description:
      "Choose how long you need and how many devices you'll connect.",
    icon: Router01Icon,
  },
  {
    title: "Pay with your card",
    description:
      "Pay securely with Paystack — bank transfer or debit card, in naira.",
    icon: CreditCardIcon,
  },
  {
    title: "Connect instantly",
    description:
      "Get a voucher code, join the Saleslip network, and you're online.",
    icon: QrCodeIcon,
  },
];

export default function HomePage() {
  return (
    <div className="bg-background min-h-svh">
      <LandingNav />

      <main>
        {/* Hero */}
        <section className="container flex flex-col items-center gap-6 py-24 text-center md:py-32">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            <span className="bg-success mr-1.5 inline-block size-1.5 rounded-full" />
            Starlink-powered WiFi · pay as you go
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Buy WiFi, go online in seconds.
          </h1>
          <p className="text-muted-foreground max-w-xl text-base text-balance md:text-lg">
            Choose a plan, pay with your card, and get a voucher code that
            connects you to the internet instantly. No account, no sign-up.
          </p>
          <div className="flex items-center gap-3">
            <Button size="lg" asChild>
              <Link href="#plans">
                Get online
                <Icon icon={ArrowRight01Icon} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how-it-works">How it works</Link>
            </Button>
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="border-y border-dashed">
          <div className="container flex flex-col gap-10 py-24">
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="text-primary text-sm font-medium tracking-wide uppercase">
                Plans &amp; pricing
              </span>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Choose how long you need
              </h2>
              <p className="text-muted-foreground text-base">
                Every plan is unlimited data on the Saleslip network. Pay once,
                connect right away.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="container flex flex-col gap-12 py-24"
        >
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="text-primary text-sm font-medium tracking-wide uppercase">
              How it works
            </span>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              From payment to connection in three steps
            </h2>
            <p className="text-muted-foreground text-base">
              No account, no router passwords, no waiting — just a voucher code
              that gets you online.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <Card key={step.title} className="gap-2" data-slot="step-card">
                <CardHeader>
                  <CardTitle className="flex flex-col gap-4">
                    <span className="bg-accent flex size-10 items-center justify-center rounded-lg">
                      <Icon
                        icon={step.icon}
                        className="text-primary size-5"
                        strokeWidth={1.5}
                      />
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-muted-foreground text-sm font-medium">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-base font-semibold">{step.title}</h3>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 md:flex-row">
          <div className="flex items-center gap-2">
            <SaleslipLogo size="sm" className="text-primary" />
            <span className="text-sm font-medium">Saleslip</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Unlimited WiFi, paid in seconds.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Admin login
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
