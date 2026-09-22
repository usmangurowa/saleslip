"use client";

import { HintLabel } from "@/components/dashboard/hint-label";
import { useRouterHealth, useSyncUsage } from "@/hooks/use-wifi-router";
import {
  Alert02Icon,
  RefreshIcon,
  RouterIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@turbo/ui/components/card";
import { Icon } from "@turbo/ui/components/icon";
import { Skeleton } from "@turbo/ui/components/skeleton";

/**
 * Router status, read live rather than inferred from order rows.
 *
 * A stale "awaiting router" count looks identical whether the hotspot is
 * healthy or simply unplugged, so the console states which one it is.
 */
export const WifiRouterHealth = () => {
  const { data, isPending, isError } = useRouterHealth();
  const syncUsage = useSyncUsage();

  const sync = () =>
    syncUsage.mutate(undefined, {
      onSuccess: ({ synced }) =>
        toast.success(
          synced === 1 ? "Synced 1 voucher" : `Synced ${synced} vouchers`,
        ),
      onError: (error) => toast.error(error.message),
    });

  if (isPending) return <Skeleton className="h-24 rounded-2xl" />;

  const reachable = data?.reachable ?? false;
  const resource = data?.resource ?? null;

  return (
    <Card variant="dashed" data-slot="wifi-router-health">
      <CardHeader>
        <CardTitle className="text-sm">
          <HintLabel
            label="Hotspot router"
            hint="Live status of the RouterOS device serving vouchers, reached over the WireGuard tunnel from the API server."
          >
            <span className="flex items-center gap-2">
              <Icon
                icon={reachable ? RouterIcon : Alert02Icon}
                className={
                  reachable ? "text-success size-4" : "text-destructive size-4"
                }
              />
              Hotspot router
            </span>
          </HintLabel>
        </CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={syncUsage.isPending || !reachable}
            onClick={sync}
          >
            <Icon icon={RefreshIcon} />
            {syncUsage.isPending ? "Syncing…" : "Sync usage"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-muted-foreground text-sm">
            Could not ask the server for router status.
          </p>
        ) : reachable ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Badge variant="secondary" className="rounded-full font-normal">
              Online
            </Badge>
            {resource?.boardName ? (
              <span className="text-muted-foreground">
                {resource.boardName}
              </span>
            ) : null}
            {resource?.version ? (
              <span className="text-muted-foreground">
                RouterOS {resource.version}
              </span>
            ) : null}
            {resource?.uptime ? (
              <span className="text-muted-foreground">
                Up {resource.uptime}
              </span>
            ) : null}
            {resource?.cpuLoad !== undefined ? (
              <span className="text-muted-foreground">
                CPU {resource.cpuLoad}%
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {data?.error ?? "The hotspot is not configured for this server."}{" "}
            Vouchers cannot be generated or revoked until it answers.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
