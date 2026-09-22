"use client";

import { StatCard } from "@/components/dashboard/stat-card";
import { useWifiStats } from "@/hooks/use-wifi";
import {
  Alert02Icon,
  CheckmarkBadge01Icon,
  Coins01Icon,
  RouterIcon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";

import { Skeleton } from "@turbo/ui/components/skeleton";
import { formatNaira } from "@turbo/wifi/format";

const StatSkeleton = () => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: 4 }, (_, index) => (
      <Skeleton key={index} className="h-28 rounded-2xl" />
    ))}
  </div>
);

/**
 * The console pulse row: today's money, what the router still owes us, and how
 * many codes are live.
 *
 * `pending_router` is broken out deliberately — those are paid orders the
 * hotspot has not accepted yet, and they are the only number here that needs
 * an operator to do something.
 */
export const WifiStatRow = () => {
  const { data, isPending } = useWifiStats();

  if (isPending) return <StatSkeleton />;
  if (!data) return null;

  const { today, orders, vouchers } = data;
  const awaitingRouter = orders.pending_router;
  const failed = orders.failed;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Revenue today"
        hint="Paid hotspot orders captured since midnight, in naira."
        icon={Coins01Icon}
        value={formatNaira(today.revenueKobo)}
        valueCaption={`${today.paidOrders} paid ${today.paidOrders === 1 ? "order" : "orders"}`}
        dim={today.paidOrders === 0}
      />
      <StatCard
        label="Awaiting router"
        hint="Orders the customer has paid for that the hotspot has not accepted yet. These retry automatically."
        icon={RouterIcon}
        iconClassName="text-warning"
        value={awaitingRouter}
        valueCaption="Paid, not yet fulfilled"
        tone={awaitingRouter > 0 ? "warning" : undefined}
        dim={awaitingRouter === 0}
      />
      <StatCard
        label="Active vouchers"
        hint="Codes that can still be used, whether sold through the shop, Telegram, or the counter."
        icon={Ticket01Icon}
        value={vouchers.active}
        valueCaption={`${vouchers.revoked} revoked`}
        dim={vouchers.active === 0}
      />
      <StatCard
        label="Fulfilment failures"
        hint="Orders that ran out of router retries or failed outright. Check the order's last error."
        icon={failed > 0 ? Alert02Icon : CheckmarkBadge01Icon}
        iconClassName={failed > 0 ? "text-destructive" : "text-success"}
        value={failed}
        valueCaption={failed > 0 ? "Needs attention" : "Everything is healthy"}
        tone={failed > 0 ? "destructive" : undefined}
        dim={failed === 0}
      />
    </div>
  );
};
