import type { Metadata } from "next";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiProfilesTable } from "@/components/dashboard/wifi/wifi-profiles-table";
import { WifiTabs } from "@/components/dashboard/wifi/wifi-tabs";

export const metadata: Metadata = {
  title: "WiFi profiles",
  description:
    "Hotspot speed profiles on the router — the plans vouchers are minted against.",
};

/**
 * WiFi console — the plan view.
 *
 * Profiles are the router-side speed plans; creating and editing them here
 * keeps the buy page and voucher minting in sync with the hardware.
 */
export default function WifiProfilesPage() {
  return (
    <>
      <PageToolbar className="rounded-2xl border px-4">
        <WifiTabs />
      </PageToolbar>
      <WifiProfilesTable />
    </>
  );
}
