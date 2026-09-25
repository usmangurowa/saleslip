import type { Metadata } from "next";
import { WifiRouterHealth } from "@/components/dashboard/wifi/wifi-router-health";

export const metadata: Metadata = {
  title: "WiFi router",
  description: "Health of the Saleslip hotspot router.",
};

/**
 * WiFi console — the router view.
 *
 * The hotspot itself, read through the API server (the only runtime with a
 * route to it). Kept separate from the money and code views so a router
 * outage never blocks voucher generation or reconciliation.
 */
export default function WifiRouterPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <WifiRouterHealth />
    </div>
  );
}
