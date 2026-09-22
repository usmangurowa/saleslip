import type { HotspotUserInput } from "@turbo/routeros";

export interface WifiPlan {
  id: string;
  name: string;
  description: string;
  priceKobo: number;
  /** Existing RouterOS hotspot user profile, as named on the router. */
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

export const VOUCHER_COMMENT_PREFIX = "saleslip";

/**
 * Short fingerprint of whatever owns the voucher, written to the RouterOS
 * comment so a hotspot user can be traced back from the router alone.
 *
 * Shop vouchers carry the order and phone (support needs the phone); counter
 * vouchers carry only the batch, because they have neither.
 */
export const voucherComment = (owner: string, phone?: string): string =>
  phone
    ? [VOUCHER_COMMENT_PREFIX, owner, phone].join("|")
    : `${VOUCHER_COMMENT_PREFIX}|${owner}`;

export interface VoucherOwner {
  /** Order id (shop sales) or batch id (counter sales). */
  owner: string;
  /** Customer phone; absent for counter sales. */
  phone?: string;
}

/**
 * Plan → RouterOS hotspot user. Username and password are both the voucher
 * code; expiry stays in the router profile's on-login script, so only the
 * total byte limit is written here.
 */
export const toHotspotUserInput = (
  plan: WifiPlan,
  input: VoucherOwner & { code: string; server?: string },
): HotspotUserInput => ({
  name: input.code,
  password: input.code,
  profile: plan.rosProfile,
  comment: voucherComment(input.owner, input.phone),
  limitBytesTotal: plan.dataLimitBytes,
  limitUptime: plan.uptimeLimit,
  server: input.server,
});
