import { describe, expect, it } from "vitest";

import { formatData, formatNaira } from "../format";
import {
  buildPlans,
  findPlan,
  sellablePlans,
  toHotspotUserInput,
  VOUCHER_COMMENT_PREFIX,
  voucherComment,
} from "../plans";

describe("buildPlans", () => {
  it("seeds the seven Saleslip plans with default profiles", () => {
    const plans = buildPlans({});
    expect(plans.map((p) => [p.id, p.priceKobo, p.rosProfile])).toEqual([
      ["pos-1", 5_000, "1-Day-1GB"],
      ["day-1", 50_000, "Saleslip-1d-1"],
      ["day-2", 150_000, "Saleslip-1d-2"],
      ["week-1", 200_000, "Saleslip-7d-1"],
      ["week-2", 400_000, "Saleslip-7d-2"],
      ["month-1", 500_000, "Saleslip-30d-1"],
      ["month-2", 800_000, "Saleslip-30d-2"],
    ]);
  });

  it("caps only the POS tier at 1 GB, leaving the unlimited plans unlimited", () => {
    const plans = buildPlans({});
    expect(findPlan(plans, "pos-1")?.dataLimitBytes).toBe(1_073_741_824);
    for (const plan of plans) {
      if (plan.id === "pos-1") continue;
      expect(plan.dataLimitBytes).toBeUndefined();
      expect(plan.uptimeLimit).toBeUndefined();
    }
  });

  it("keeps duo plans out of the sellable list", () => {
    expect(sellablePlans(buildPlans({})).map((p) => p.id)).toEqual([
      "pos-1",
      "day-1",
      "week-1",
      "month-1",
    ]);
  });

  it("lets env override the RouterOS profile names", () => {
    const plans = buildPlans({ day1: "mikhmon-1d" });
    expect(findPlan(plans, "day-1")?.rosProfile).toBe("mikhmon-1d");
    expect(findPlan(plans, "day-2")?.rosProfile).toBe("Saleslip-1d-2");
  });
});

describe("toHotspotUserInput", () => {
  const plans = buildPlans({});

  it("maps a plan to username=password=code with its profile and no byte cap", () => {
    const plan = findPlan(plans, "week-1");
    if (!plan) throw new Error("missing plan");
    const code = "SLAB2C3";
    const input = toHotspotUserInput(plan, {
      code,
      owner: "order-1",
      phone: "+2348012345678",
      server: "hotspot1",
    });
    expect(input).toEqual({
      name: code,
      password: code,
      profile: "Saleslip-7d-1",
      comment: `${VOUCHER_COMMENT_PREFIX}|order-1|+2348012345678`,
      limitBytesTotal: undefined,
      limitUptime: undefined,
      server: "hotspot1",
    });
  });

  it("carries the POS tier's byte cap onto the hotspot user", () => {
    const plans = buildPlans({});
    const plan = findPlan(plans, "pos-1");
    if (!plan) throw new Error("missing plan");
    const input = toHotspotUserInput(plan, { code: "SLPOS50", owner: "o" });
    expect(input.profile).toBe("1-Day-1GB");
    expect(input.limitBytesTotal).toBe(1_073_741_824);
  });

  it("leaves limits off so the router profile governs expiry", () => {
    const plan = findPlan(plans, "day-1");
    if (!plan) throw new Error("missing plan");
    const input = toHotspotUserInput(plan, {
      code: "SLZZZZZ",
      owner: "o",
      phone: "p",
    });
    expect(input.limitBytesTotal).toBeUndefined();
    expect(input.limitUptime).toBeUndefined();
    expect(input.server).toBeUndefined();
  });

  it("tags a counter voucher with its batch when there is no phone", () => {
    const plan = findPlan(plans, "day-1");
    if (!plan) throw new Error("missing plan");
    const input = toHotspotUserInput(plan, {
      code: "SLQQQQQ",
      owner: "batch-9",
    });
    expect(input.comment).toBe(`${VOUCHER_COMMENT_PREFIX}|batch-9`);
  });
});

describe("voucherComment", () => {
  it("includes the phone only when one is known", () => {
    expect(voucherComment("order-1", "+2348012345678")).toBe(
      "saleslip|order-1|+2348012345678",
    );
    expect(voucherComment("batch-9")).toBe("saleslip|batch-9");
  });
});

describe("formatters", () => {
  it("formats kobo as naira", () => {
    expect(formatNaira(100_000)).toBe("₦1,000");
    expect(formatNaira(150_000)).toBe("₦1,500");
  });

  it("formats data limits", () => {
    expect(formatData(undefined)).toBe("Unlimited");
    expect(formatData(1024 ** 3)).toBe("1GB");
    expect(formatData(5 * 1024 ** 3)).toBe("5GB");
  });
});
