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
  it("seeds the three Saleslip plans with default profiles", () => {
    const plans = buildPlans({});
    expect(plans.map((p) => [p.id, p.priceKobo, p.rosProfile])).toEqual([
      ["daily-unlimited", 50_000, "Daily-Unlimited"],
      ["daily-1gb", 30_000, "Daily-1GB"],
      ["weekly-5gb", 150_000, "Weekly-5GB"],
    ]);
  });

  it("lets env override the RouterOS profile names", () => {
    const plans = buildPlans({ daily1gb: "mikhmon-1g" });
    expect(findPlan(plans, "daily-1gb")?.rosProfile).toBe("mikhmon-1g");
    expect(findPlan(plans, "daily-unlimited")?.rosProfile).toBe(
      "Daily-Unlimited",
    );
  });
});

describe("toHotspotUserInput", () => {
  const plans = buildPlans({});

  it("maps a data plan to username=password=code with a byte limit", () => {
    const plan = findPlan(plans, "weekly-5gb");
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
      profile: "Weekly-5GB",
      comment: `${VOUCHER_COMMENT_PREFIX}|order-1|+2348012345678`,
      limitBytesTotal: 5 * 1024 ** 3,
      limitUptime: undefined,
      server: "hotspot1",
    });
  });

  it("leaves limits off for unlimited plans so the router profile governs expiry", () => {
    const plan = findPlan(plans, "daily-unlimited");
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
    const plan = findPlan(plans, "daily-1gb");
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
    expect(formatNaira(50_000)).toBe("₦500");
    expect(formatNaira(150_000)).toBe("₦1,500");
  });

  it("formats data limits", () => {
    expect(formatData(undefined)).toBe("Unlimited");
    expect(formatData(1024 ** 3)).toBe("1GB");
    expect(formatData(5 * 1024 ** 3)).toBe("5GB");
  });
});
