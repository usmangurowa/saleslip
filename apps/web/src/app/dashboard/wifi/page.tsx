import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiBatchDialog } from "@/components/dashboard/wifi/wifi-batch-dialog";
import { WifiOrdersTable } from "@/components/dashboard/wifi/wifi-orders-table";
import { WifiStatRow } from "@/components/dashboard/wifi/wifi-stat-row";
import { WifiTabs } from "@/components/dashboard/wifi/wifi-tabs";

/**
 * WiFi console — the money view.
 *
 * Revenue and stuck fulfilments first, then the order ledger. Router state
 * (live sessions, usage, kick) is not here: the web runtime has no route to
 * the hotspot, so those live in `apps/server` behind the local network.
 */
export default function WifiOrdersPage() {
  return (
    <>
      <PageToolbar className="rounded-2xl border px-4">
        <WifiTabs />
        <WifiBatchDialog />
      </PageToolbar>
      <WifiStatRow />
      <WifiOrdersTable />
    </>
  );
}
