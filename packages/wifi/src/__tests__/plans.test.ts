import { describe, expect, it } from "vitest";

import { formatData, formatNaira } from "../format";
import {
  buildPlans,
  findPlan,
  toHotspotUserInput,
  VOUCHER_COMMENT_PREFIX,
  voucherComment,
} from "../plans";

describe("buildPlans", () => {
  it("seeds the six Saleslip plans with default profiles", () => {
    const plans = buildPlans({});
    expect(plans.map((p) => [p.id, p.priceKobo, p.rosProfile])).toEqual([
      ["day-1", 100_000, "Saleslip-1d-1"],
      ["day-2", 150_000, "Saleslip-1d-2"],
      ["week-1", 300_000, "Saleslip-7d-1"],
      ["week-2", 400_000, "Saleslip-7d-2"],
      ["month-1", 600_000, "Saleslip-30d-1"],
      ["month-2", 800_000, "Saleslip-30d-2"],
    ]);
  });

  it("lets env override the RouterOS profile names", () => {
    const plans = buildPlans({ day1: "mikhmon-1d" });
    expect(findPlan(plans, "day-1")?.rosProfile).toBe("mikhmon-1d");
    expect(findPlan(plans, "day-2")?.rosProfile).toBe("Saleslip-1d-2");
  });

  it("leaves every plan unlimited so the router profile governs limits", () => {
    const plans = buildPlans({});
    for (const plan of plans) {
      expect(plan.dataLimitBytes).toBeUndefined();
      expect(plan.uptimeLimit).toBeUndefined();
    }
  });
});

describe("toHotspotUserInput", () => {
  const plans = buildPlans({});

  it("maps a plan to username=password=code with its profile and no byte cap", () => {
    const plan = findPlan(plans, "week-1");
    if (!plan) throw new Error("missing plan");
    const code = "GWAB2C3";
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

  it("leaves limits off so the router profile governs expiry", () => {
    const plan = findPlan(plans, "day-1");
    if (!plan) throw new Error("missing plan");
    const input = toHotspotUserInput(plan, {
      code: "GWZZZZZ",
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
      code: "GWQQQQQ",
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
