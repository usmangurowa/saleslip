import Link from "next/link";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import type { WifiPlan } from "@turbo/wifi";
import { formatNaira } from "@turbo/wifi";
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

export const PlanCard = ({ plan }: { plan: WifiPlan }) => (
  <Card className="h-full gap-4" data-slot="plan-card">
    <CardHeader>
      <CardTitle className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        <Badge variant="secondary" className="shrink-0">
          {plan.validityLabel}
        </Badge>
      </CardTitle>
      <CardDescription>{plan.description}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-1">
      <span className="text-3xl font-semibold tracking-tight">
        {formatNaira(plan.priceKobo)}
      </span>
      <span className="text-muted-foreground text-sm">Unlimited data</span>
    </CardContent>
    <CardFooter className="mt-auto">
      <Button className="w-full" asChild>
        <Link href={`/buy?plan=${plan.id}`}>
          Buy now
          <Icon icon={ArrowRight01Icon} />
        </Link>
      </Button>
    </CardFooter>
  </Card>
);
