import { PageToolbar } from "@/components/dashboard/page-toolbar";
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
  return (
    <>
      <PageToolbar className="rounded-2xl border px-4">
        <WifiBatchDialog />
      </PageToolbar>
      <WifiStatRow />
      <WifiOrdersTable />
    </>
  );
}
