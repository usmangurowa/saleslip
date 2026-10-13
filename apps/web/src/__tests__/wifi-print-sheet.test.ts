import { describe, expect, it } from "vitest";

import {
  buildVoucherSheetHtml,
  hotspotLoginUrl,
  VOUCHER_BRAND,
  VOUCHERS_PER_PAGE,
} from "../components/dashboard/wifi/wifi-print-sheet";

const plan = {
  name: "1 Day · 1 Device",
  priceKobo: 100_000,
  validityLabel: "24 hours",
};

const sheet = (count: number) =>
  buildVoucherSheetHtml({
    title: "Counter — Oct 13",
    plan,
    logoUrl: "https://saleslip.app/brand/guilders-logo.png",
    vouchers: Array.from({ length: count }, (_, i) => ({
      code: `SLAAA${String(i).padStart(2, "0")}`,
      qrSvg: "<svg></svg>",
    })),
  });

describe("voucher print sheet", () => {
  it("logs in with the code as both username and password", () => {
    expect(hotspotLoginUrl("SLABCDE")).toBe(
      "http://router.lan/login?username=SLABCDE&password=SLABCDE",
    );
  });

  it("fills one A4 page with 24 vouchers", () => {
    const html = sheet(VOUCHERS_PER_PAGE);
    expect(html.match(/class="page"/g)).toHaveLength(1);
    expect(html.match(/class="card"/g)).toHaveLength(24);
    expect(html).toContain("@page { size: A4");
  });

  it("starts a new page past 24", () => {
    expect(sheet(25).match(/class="page"/g)).toHaveLength(2);
  });

  it("prints the venue, plan, and support details on each card", () => {
    const html = sheet(1);
    expect(html).toContain(VOUCHER_BRAND.wifiName);
    expect(html).toContain(VOUCHER_BRAND.supportPhone);
    expect(html).toContain(VOUCHER_BRAND.loginHost);
    expect(html).toContain("SLAAA00");
    expect(html).toContain("Valid 24 hours · ₦1,000");
  });
});
