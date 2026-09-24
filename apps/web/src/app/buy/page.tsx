import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { BuyForm } from "@/components/shop/buy-form";
import { PlanCard } from "@/components/shop/plan-card";

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
  searchParams: Promise<{ plan?: string; planId?: string }>;
}) {
  const params = await searchParams;
  const planId = params.planId ?? params.plan;
  const plan = planId ? findPlan(buildPlans(), planId) : undefined;

  return (
    <div className="bg-background min-h-svh">
      <LandingNav />
      <main className="container flex flex-col items-center gap-10 py-16">
        {plan ? (
          <div className="flex w-full flex-col items-center gap-6">
            <Button variant="ghost" size="sm" asChild className="self-start">
              <Link href="/buy">← Change plan</Link>
            </Button>
            <BuyForm plan={plan} />
          </div>
        ) : (
          <>
            <div className="flex max-w-2xl flex-col items-center gap-3 text-center">
              <h1 className="text-3xl font-semibold tracking-tight">
                Choose a plan
              </h1>
              <p className="text-muted-foreground text-base">
                Pick how long you need and how many devices you want to connect.
                Every plan is unlimited data.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {buildPlans().map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
