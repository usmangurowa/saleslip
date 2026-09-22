import type { HotspotUserInput } from "@turbo/routeros";

export interface WifiPlan {
  id: string;
  name: string;
  description: string;
  priceKobo: number;
  /** Existing RouterOS hotspot user profile (created in Mikhmon). */
  rosProfile: string;
  dataLimitBytes?: number;
  /** RouterOS duration, e.g. `1d`, `7d`. */
  uptimeLimit?: string;
  validityLabel: string;
}

export interface PlanProfileOverrides {
  dailyUnlimited?: string;
  daily1gb?: string;
  weekly5gb?: string;
}

const GB = 1024 ** 3;

export const buildPlans = (
  overrides: PlanProfileOverrides = {},
): readonly WifiPlan[] => [
  {
    id: "daily-unlimited",
    name: "Daily Unlimited",
    description: "Unlimited data for 24 hours on one device.",
    priceKobo: 50_000,
    rosProfile: overrides.dailyUnlimited ?? "Daily-Unlimited",
    validityLabel: "24 hours",
  },
  {
    id: "daily-1gb",
    name: "Daily 1GB",
    description: "1GB of data, valid for 24 hours.",
    priceKobo: 30_000,
    rosProfile: overrides.daily1gb ?? "Daily-1GB",
    dataLimitBytes: 1 * GB,
    validityLabel: "24 hours",
  },
  {
    id: "weekly-5gb",
    name: "Weekly 5GB",
    description: "5GB of data, valid for 7 days.",
    priceKobo: 150_000,
    rosProfile: overrides.weekly5gb ?? "Weekly-5GB",
    dataLimitBytes: 5 * GB,
    validityLabel: "7 days",
  },
];

export const findPlan = (
  plans: readonly WifiPlan[],
  id: string,
): WifiPlan | undefined => plans.find((plan) => plan.id === id);

export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export const formatData = (bytes: number | undefined): string =>
  bytes === undefined ? "Unlimited" : `${Math.round(bytes / GB)}GB`;

export const VOUCHER_COMMENT_PREFIX = "saleslip";

/**
 * Plan → RouterOS hotspot user. Username and password are both the voucher
 * code; expiry stays in the Mikhmon profile's on-login script, so only the
 * total byte limit is written here.
 */
export const toHotspotUserInput = (
  plan: WifiPlan,
  input: { code: string; orderId: string; phone: string; server?: string },
): HotspotUserInput => ({
  name: input.code,
  password: input.code,
  profile: plan.rosProfile,
  comment: [VOUCHER_COMMENT_PREFIX, input.orderId, input.phone].join("|"),
  limitBytesTotal: plan.dataLimitBytes,
  limitUptime: plan.uptimeLimit,
  server: input.server,
});
