import type { Metadata } from "next";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiPlansTable } from "@/components/dashboard/wifi/wifi-plans-table";
import { WifiTabs } from "@/components/dashboard/wifi/wifi-tabs";

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
    <>
      <PageToolbar className="rounded-2xl border px-4">
        <WifiTabs />
      </PageToolbar>
      <WifiPlansTable />
    </>
  );
}
