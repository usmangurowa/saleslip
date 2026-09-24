import type { Metadata } from "next";
import type * as React from "react";

export const metadata: Metadata = {
  title: "WiFi console",
  description: "Vouchers, hotspot orders, and revenue.",
};

export default function WifiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>;
}
