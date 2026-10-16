import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { BuyForm } from "@/components/shop/buy-form";
import { buildBuyHref, PlanCard } from "@/components/shop/plan-card";
import { loadShopPlans } from "@/lib/wifi-plans";

import { findPlan, sellablePlans } from "@turbo/wifi";

// `searchParams` is runtime data, so this route can't be prerendered.
export const instant = false;

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string;
    planId?: string;
    mac?: string;
    ip?: string;
    login?: string;
  }>;
}) {
  const { plan: planParam, planId, mac, ip, login } = await searchParams;
  const portal = { mac, ip, login };
  const plans = sellablePlans(await loadShopPlans());
  const selectedPlanId = planParam ?? planId;
  const selected = selectedPlanId ? findPlan(plans, selectedPlanId) : undefined;

  return (
    <div className="bg-background min-h-svh">
      <LandingNav />

      <main className="container py-12 md:py-20">
        {selected ? (
          <div className="mx-auto flex max-w-md flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Link
                href={buildBuyHref(undefined, portal)}
                className="text-muted-foreground hover:text-foreground w-fit text-sm"
              >
                &larr; Change plan
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Complete your purchase
              </h1>
              <p className="text-muted-foreground text-sm">
                Pay securely with Paystack and get your voucher code right away.
              </p>
            </div>
            <BuyForm plan={selected} portal={portal} />
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="text-primary text-sm font-medium tracking-wide uppercase">
                Buy WiFi
              </span>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Choose a plan to get started
              </h1>
              <p className="text-muted-foreground text-base">
                Pick how long you need. Every plan is unlimited data on the
                Saleslip network.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} portal={portal} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
