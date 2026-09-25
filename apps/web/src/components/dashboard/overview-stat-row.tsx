"use client";

import { QueryError } from "@/components/dashboard/query-error";
import { StatCard } from "@/components/dashboard/stat-card";
import type { RevenueRange } from "@/components/dashboard/revenue-range-toggle";
import { useWifiStats } from "@/hooks/use-wifi";
import { useHotspotSessions } from "@/hooks/use-wifi-router";
import {
  Coins01Icon,
  Ticket01Icon,
  UserGroupIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

import { Skeleton } from "@turbo/ui/components/skeleton";
import { formatNaira } from "@turbo/wifi/format";

interface OverviewStatRowProps {
  revenueRange: RevenueRange;
}

const StatSkeleton = () => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: 4 }, (_, index) => (
      <Skeleton key={index} className="h-28 rounded-2xl" />
    ))}
  </div>
);

/**
 * The overview pulse row: who is on the hotspot, today's money, and how the
 * voucher catalogue is doing.
 *
 * "Connected now" comes from the router itself, so it degrades to a dash when
 * `apps/server` cannot reach the hotspot — an unreachable router must not
 * take the rest of the overview down with it.
 */
export const OverviewStatRow = ({ revenueRange }: OverviewStatRowProps) => {
  const stats = useWifiStats();
  const sessions = useHotspotSessions();

  if (stats.isPending || sessions.isPending) return <StatSkeleton />;
  // A failed stats query still surfaces an explicit error row — never a
  // silently blank overview.
  if (stats.isError) {
    return (
      <QueryError
        title="Could not load overview metrics"
        framed={false}
        onRetry={() => void stats.refetch()}
      />
    );
  }
  if (!stats.data) return null;

  const { revenue, vouchers, generated } = stats.data;
  const current = revenue[revenueRange];
  const routerUnreachable = sessions.isError || !sessions.data;
  const connected = sessions.data?.live ?? 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        size="hero"
        label="Connected now"
        hint="Clients on the hotspot right now, reported by the router every 15 seconds."
        icon={UserGroupIcon}
        value={routerUnreachable ? "—" : connected}
        valueCaption={
          routerUnreachable
            ? undefined
            : `${connected} ${connected === 1 ? "client" : "clients"}`
        }
        caption={routerUnreachable ? "Router unreachable" : undefined}
        dim={routerUnreachable || connected === 0}
      />
      <StatCard
        size="hero"
        label="Revenue"
        hint="Paid hotspot orders in naira, over the selected range. 7d and 30d are trailing windows that include today."
        icon={Coins01Icon}
        value={formatNaira(current.revenueKobo)}
        valueCaption={`${current.paidOrders} paid ${current.paidOrders === 1 ? "order" : "orders"}`}
        dim={current.paidOrders === 0}
      />
      <StatCard
        size="hero"
        label="Vouchers generated"
        hint="Every code issued since launch — shop, Telegram, and counter sales combined."
        icon={Ticket01Icon}
        value={generated.total}
        valueCaption={`${generated.today} ${generated.today === 1 ? "code" : "codes"} today`}
        dim={generated.total === 0}
      />
      <StatCard
        size="hero"
        label="Active vouchers"
        hint="Codes that can still be used, whether sold through the shop, Telegram, or the counter."
        icon={Wifi01Icon}
        value={vouchers.active}
        valueCaption="codes usable now"
        dim={vouchers.active === 0}
      />
    </div>
  );
};
