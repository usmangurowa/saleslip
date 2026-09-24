import type { Metadata } from "next";
import { WifiPlansTable } from "@/components/dashboard/wifi/wifi-plans-table";

export const metadata: Metadata = {
  title: "WiFi plans",
  description:
    "The purchasable plan catalogue — what the buy page sells and vouchers mint against.",
};

/**
 * WiFi console — the catalogue view.
 *
 * Plans live in the database, so a plan created here (pointing at a router
 * profile) shows up on the buy page immediately — no deploy or env change.
 */
export default function WifiPlansPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <WifiPlansTable />
    </div>
  );
}
