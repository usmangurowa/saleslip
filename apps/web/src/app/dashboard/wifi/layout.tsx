import type { Metadata } from "next";
import type * as React from "react";
import { wifiNav } from "@/components/dashboard/nav-config";

const wifiNavItem = wifiNav[0];

export const metadata: Metadata = {
  title: wifiNavItem?.label ?? "WiFi",
  description: wifiNavItem?.description,
};

export default function WifiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>;
}
