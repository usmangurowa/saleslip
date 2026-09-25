import type { Metadata } from "next";
import { WifiCustomersTable } from "@/components/dashboard/wifi/wifi-customers-table";

export const metadata: Metadata = {
  title: "WiFi customers",
  description: "Everyone who has bought access to the Saleslip hotspot.",
};

/**
 * WiFi console — the customer view.
 *
 * Orders say what was sold; customers say who is buying. This page rolls
 * orders up by phone number so repeat buyers and their lifetime spend are
 * visible at a glance.
 */
export default function WifiCustomersPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <WifiCustomersTable />
    </div>
  );
}
