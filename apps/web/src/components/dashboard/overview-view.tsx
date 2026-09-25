"use client";

import { useState } from "react";
import { OverviewStatRow } from "@/components/dashboard/overview-stat-row";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import type { RevenueRange } from "@/components/dashboard/revenue-range-toggle";
import { RevenueRangeToggle } from "@/components/dashboard/revenue-range-toggle";
import { WifiBatchDialog } from "@/components/dashboard/wifi/wifi-batch-dialog";
import { WifiSessionsTable } from "@/components/dashboard/wifi/wifi-sessions-table";

export const OverviewView = () => {
  const [range, setRange] = useState<RevenueRange>("today");

  return (
    <>
      <PageToolbar>
        <WifiBatchDialog />
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground hidden text-sm lg:block">
            Live pulse of the hotspot business — vouchers, payments, and who is
            online right now.
          </p>
          <RevenueRangeToggle value={range} onValueChange={setRange} />
        </div>
      </PageToolbar>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <OverviewStatRow revenueRange={range} />
        <WifiSessionsTable />
      </div>
    </>
  );
};
