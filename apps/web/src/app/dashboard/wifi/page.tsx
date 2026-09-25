"use client";

import { useState } from "react";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import type { RevenueRange } from "@/components/dashboard/revenue-range-toggle";
import { RevenueRangeToggle } from "@/components/dashboard/revenue-range-toggle";
import { WifiBatchDialog } from "@/components/dashboard/wifi/wifi-batch-dialog";
import { WifiOrdersTable } from "@/components/dashboard/wifi/wifi-orders-table";
import { WifiStatRow } from "@/components/dashboard/wifi/wifi-stat-row";

/**
 * WiFi console — the money view.
 *
 * Revenue and stuck fulfilments first, then the order ledger. Router state
 * (live sessions, usage, kick) sits behind the Live tab, which is served by
 * `apps/server` — this runtime has no route to the hotspot.
 */
export default function WifiOrdersPage() {
  const [range, setRange] = useState<RevenueRange>("today");

  return (
    <>
      <PageToolbar>
        <WifiBatchDialog />
        <RevenueRangeToggle value={range} onValueChange={setRange} />
      </PageToolbar>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <WifiStatRow revenueRange={range} />
        <WifiOrdersTable />
      </div>
    </>
  );
}
