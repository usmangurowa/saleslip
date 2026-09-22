"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@turbo/ui/components/button";
import { cn } from "@turbo/ui/lib/utils";

const tabs = [
  { label: "Orders", href: "/dashboard/wifi" },
  { label: "Vouchers", href: "/dashboard/wifi/vouchers" },
] as const;

/**
 * The console's two views. Orders is the money view, vouchers is the code
 * view, and both read the same tables — so they sit side by side rather than
 * nested.
 */
export const WifiTabs = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="WiFi console sections"
      className="flex items-center gap-1"
      data-slot="wifi-tabs"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              buttonVariants({
                variant: isActive ? "secondary" : "ghost",
                size: "sm",
              }),
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};
