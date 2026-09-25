import type { IconSvgElement } from "@hugeicons/react";
import {
  AiChat02Icon,
  DashboardSquare01Icon,
  Layers02Icon,
  RouterIcon,
  Settings01Icon,
  SignalIcon,
  Ticket01Icon,
  UserGroupIcon,
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
  item(
    "Assistant",
    "assistant",
    AiChat02Icon,
    "Ask questions about your workspace.",
  ),
];

export const wifiNav: DashboardNavItem[] = [
  item("Orders", "wifi", RouterIcon, "Hotspot orders, revenue, and batches."),
  item(
    "Vouchers",
    "wifi/vouchers",
    Ticket01Icon,
    "Every voucher code issued for the hotspot.",
  ),
  item(
    "Live",
    "wifi/live",
    SignalIcon,
    "Clients connected to the hotspot right now.",
  ),
  item(
    "Profiles",
    "wifi/profiles",
    UserGroupIcon,
    "Router speed profiles vouchers mint against.",
  ),
  item(
    "Plans",
    "wifi/plans",
    Layers02Icon,
    "The purchasable plan catalogue sold on the buy page.",
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
  settingsNavItem,
].filter((navItem) => navItem.slug !== null);
