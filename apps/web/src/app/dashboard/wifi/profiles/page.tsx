import type { Metadata } from "next";
import { WifiProfilesTable } from "@/components/dashboard/wifi/wifi-profiles-table";

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
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <WifiProfilesTable />
    </div>
  );
}
