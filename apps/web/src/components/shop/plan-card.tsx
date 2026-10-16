import Link from "next/link";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import type { WifiPlan } from "@turbo/wifi";
import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@turbo/ui/components/card";
import { Icon } from "@turbo/ui/components/icon";
import { formatData, formatNaira } from "@turbo/wifi";

export interface PortalContext {
  mac?: string;
  ip?: string;
  login?: string;
}

export const buildBuyHref = (
  planId: string | undefined,
  portal?: PortalContext,
): string => {
  const params = new URLSearchParams();
  if (planId) params.set("plan", planId);
  if (portal?.mac) params.set("mac", portal.mac);
  if (portal?.ip) params.set("ip", portal.ip);
  if (portal?.login) params.set("login", portal.login);
  const query = params.toString();
  return query ? `/buy?${query}` : "/buy";
};

export const PlanCard = ({
  plan,
  portal,
}: {
  plan: WifiPlan;
  portal?: PortalContext;
}) => (
  <Card className="h-full gap-4" data-slot="plan-card">
    <CardHeader>
      <CardTitle className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        {plan.validityLabel ? (
          <Badge variant="secondary" className="shrink-0">
            {plan.validityLabel}
          </Badge>
        ) : null}
      </CardTitle>
      <CardDescription>{plan.description}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-1">
      <span className="text-3xl font-semibold tracking-tight">
        {formatNaira(plan.priceKobo)}
      </span>
      <span className="text-muted-foreground text-sm">
        {formatData(plan.dataLimitBytes)} data
      </span>
    </CardContent>
    <CardFooter className="mt-auto">
      <Button className="w-full" asChild>
        <Link href={buildBuyHref(plan.id, portal)}>
          Buy now
          <Icon icon={ArrowRight01Icon} />
        </Link>
      </Button>
    </CardFooter>
  </Card>
);
