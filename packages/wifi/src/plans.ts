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
  /** Whether the plan is purchasable; catalogue rows carry this, minting ignores it. */
  active?: boolean;
  /** Display order for the buy page; lower numbers first. */
  sortOrder?: number;
}

export interface PlanProfileOverrides {
  day1?: string;
  day2?: string;
  week1?: string;
  week2?: string;
  month1?: string;
  month2?: string;
}

/**
 * Seed catalogue, used when the `wifi_plan` table is empty or unreachable.
 * The ₦50 1 GB POS tier and the ₦200 5 GB day are the data-capped entry
 * products, capped per voucher at minting; the unlimited plans carry
 * no byte cap so the router profile governs limits. Duo plans stay listed
 * (inactive) so vouchers already sold on their profiles still resolve to a
 * plan; buyer-facing lists filter them out.
 */
export const buildPlans = (
  overrides: PlanProfileOverrides = {},
): readonly WifiPlan[] => [
  {
    id: "pos-1",
    name: "1 Day · 1 GB",
    description:
      "1 GB of data for 24 hours — right-sized for POS and light use.",
    priceKobo: 5_000,
    rosProfile: "1-Day-1GB",
    dataLimitBytes: 1_073_741_824,
    validityLabel: "24 hours",
    sortOrder: 0,
  },
  {
    // Mid tier. Runs a full week on the router (profile `1-Week-5GB`), but
    // no duration is listed buyer-facing: the data cap sells the plan, and
    // stating "1 week" would undercut the ₦2,000 unlimited week. Empty
    // validityLabel makes every buyer surface skip its validity line.
    id: "day-5gb",
    name: "5 GB Data",
    description: "5 GB of data on one device.",
    priceKobo: 20_000,
    rosProfile: "1-Week-5GB",
    dataLimitBytes: 5_368_709_120,
    validityLabel: "",
    sortOrder: 1,
  },
  {
    id: "day-1",
    name: "1 Day · 1 Device",
    description: "Unlimited data for 24 hours on one device.",
    priceKobo: 50_000,
    rosProfile: overrides.day1 ?? "Saleslip-1d-1",
    validityLabel: "24 hours",
    sortOrder: 2,
  },
  {
    id: "day-2",
    name: "1 Day · 2 Devices",
    description: "Unlimited data for 24 hours on up to two devices.",
    priceKobo: 150_000,
    rosProfile: overrides.day2 ?? "Saleslip-1d-2",
    validityLabel: "24 hours",
    active: false,
    sortOrder: 5,
  },
  {
    id: "week-1",
    name: "1 Week · 1 Device",
    description: "Unlimited data for 7 days on one device.",
    priceKobo: 200_000,
    rosProfile: overrides.week1 ?? "Saleslip-7d-1",
    validityLabel: "7 days",
    sortOrder: 3,
  },
  {
    id: "week-2",
    name: "1 Week · 2 Devices",
    description: "Unlimited data for 7 days on up to two devices.",
    priceKobo: 400_000,
    rosProfile: overrides.week2 ?? "Saleslip-7d-2",
    validityLabel: "7 days",
    active: false,
    sortOrder: 6,
  },
  {
    id: "month-1",
    name: "1 Month · 1 Device",
    description: "Unlimited data for 30 days on one device.",
    priceKobo: 500_000,
    rosProfile: overrides.month1 ?? "Saleslip-30d-1",
    validityLabel: "30 days",
    sortOrder: 4,
  },
  {
    id: "month-2",
    name: "1 Month · 2 Devices",
    description: "Unlimited data for 30 days on up to two devices.",
    priceKobo: 800_000,
    rosProfile: overrides.month2 ?? "Saleslip-30d-2",
    validityLabel: "30 days",
    active: false,
    sortOrder: 7,
  },
];

/** Plans a buyer can purchase; catalogue rows without `active` count as sellable. */
export const sellablePlans = (
  plans: readonly WifiPlan[],
): readonly WifiPlan[] => plans.filter((plan) => plan.active !== false);

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
