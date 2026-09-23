import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { BuyForm } from "@/components/shop/buy-form";

import { Button } from "@turbo/ui/components/button";
import { buildPlans, findPlan } from "@turbo/wifi";

export const metadata: Metadata = {
  title: "Buy WiFi — Saleslip",
  description: "Choose a plan, pay by card, and get online instantly.",
};

// `searchParams.plan` is runtime data, so this route can't be prerendered.
export const instant = false;

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planId } = await searchParams;
  const plan = planId ? findPlan(buildPlans(), planId) : undefined;

  return (
    <div className="bg-background min-h-svh">
      <LandingNav />
      <main className="container flex flex-col items-center gap-6 py-16">
        {plan ? (
          <BuyForm plan={plan} />
        ) : (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Choose a plan first
            </h1>
            <p className="text-muted-foreground text-sm">
              Pick how long you need and how many devices you want to connect.
            </p>
            <Button asChild>
              <Link href="/#plans">View plans</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
