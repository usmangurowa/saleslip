import type { Metadata } from "next";
import { WifiBatchList } from "@/components/dashboard/wifi/wifi-batch-list";
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
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <WifiVouchersTable />
      <WifiBatchList />
    </div>
  );
}
