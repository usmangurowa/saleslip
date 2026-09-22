import type { Metadata } from "next";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiBatchList } from "@/components/dashboard/wifi/wifi-batch-list";
import { WifiTabs } from "@/components/dashboard/wifi/wifi-tabs";
import { WifiVouchersTable } from "@/components/dashboard/wifi/wifi-vouchers-table";

export const metadata: Metadata = {
  title: "WiFi vouchers",
  description: "Every voucher code issued for the Saleslip hotspot.",
};

/**
 * WiFi console — the code view.
 *
 * Codes are what customers quote at the counter, so this is the lookup and
 * revoke surface; batches sit above it to keep printed sheets traceable.
 */
export default function WifiVouchersPage() {
  return (
    <>
      <PageToolbar className="rounded-2xl border px-4">
        <WifiTabs />
      </PageToolbar>
      <WifiVouchersTable />
      <WifiBatchList />
    </>
  );
}
