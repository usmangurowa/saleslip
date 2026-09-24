import type { IconSvgElement } from "@hugeicons/react";
import {
  AiChat02Icon,
  DashboardSquare01Icon,
  Settings01Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

export interface DashboardNavItem {
  label: string;
  slug: string | null;
  href: string;
  icon: IconSvgElement;
  description: string;
}

const item = (
  label: string,
  slug: string | null,
  icon: IconSvgElement,
  description: string,
): DashboardNavItem => ({
  label,
  slug,
  href: slug ? `/dashboard/${slug}` : "/dashboard",
  icon,
  description,
});

export const platformNav: DashboardNavItem[] = [
  item("Overview", null, DashboardSquare01Icon, "Your workspace at a glance."),
];

export const wifiNav: DashboardNavItem[] = [
  item("WiFi", "wifi", Wifi01Icon, "Vouchers, hotspot orders, and revenue."),
];

export const aiNav: DashboardNavItem[] = [
  item(
    "Assistant",
    "assistant",
    AiChat02Icon,
    "Ask questions about your workspace.",
  ),
];

export const settingsNavItem: DashboardNavItem = item(
  "Settings",
  "settings",
  Settings01Icon,
  "Workspace preferences and configuration.",
);

export const sectionNavItems: DashboardNavItem[] = [
  ...platformNav,
  ...wifiNav,
  ...aiNav,
  settingsNavItem,
].filter((navItem) => navItem.slug !== null);
