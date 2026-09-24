import type { Metadata } from "next";
import { WifiRouterHealth } from "@/components/dashboard/wifi/wifi-router-health";
import { WifiSessionsTable } from "@/components/dashboard/wifi/wifi-sessions-table";

export const metadata: Metadata = {
  title: "WiFi live",
  description: "Clients connected to the Saleslip hotspot right now.",
};

/**
 * WiFi console — the router view.
 *
 * Everything here is read from the hotspot itself through the API server,
 * which is the only runtime with a route to it. That is also why this is a
 * separate tab: if the router stops answering, the money and code views still
 * work while this one says so.
 */
export default function WifiLivePage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <WifiRouterHealth />
      <WifiSessionsTable />
    </div>
  );
}
