import { describe, expect, it } from "vitest";

import {
  buildVoucherSheetHtml,
  VOUCHER_BRAND,
  VOUCHERS_PER_PAGE,
  wifiJoinQrPayload,
} from "../components/dashboard/wifi/wifi-print-sheet";

const plan = {
  name: "1 Day Unlimited",
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
  it("joins the venue WiFi from the QR, not a login URL", () => {
    expect(wifiJoinQrPayload()).toBe(
      `WIFI:S:${VOUCHER_BRAND.wifiName};T:nopass;;`,
    );
  });

  it("fills one A4 page with 24 vouchers", () => {
    const html = sheet(VOUCHERS_PER_PAGE);
    expect(html.match(/class="page"/g)).toHaveLength(1);
    expect(html.match(/class="card"/g)).toHaveLength(24);
    expect(html).toContain("@page { size: A4");
  });

  it("spaces the cards apart with half-gap page edges", () => {
    const html = sheet(1);
    expect(html).toContain("@page { size: A4; margin: 0; }");
    expect(html).toContain("padding: 2.5mm 1.5mm");
    expect(html).toContain("gap: 5mm 3mm");
    expect(html).toContain("border: 0.2mm dashed #aaa");
    expect(html).not.toContain("border-right: 0.2mm dashed");
  });

  it("starts a new page past 24", () => {
    expect(sheet(25).match(/class="page"/g)).toHaveLength(2);
  });

  it("prints the venue, plan, and support details on each card", () => {
    const html = sheet(1);
    expect(html).toContain(VOUCHER_BRAND.wifiName);
    expect(html).toContain("Guilders Starlink");
    expect(html).toContain(VOUCHER_BRAND.supportPhone);
    expect(html).toContain("SLAAA00");
    expect(html).toContain("Valid 24 hours");
    expect(html).toContain("Scan to join");
  });

  it("omits the validity line when the plan carries no validity label", () => {
    const html = buildVoucherSheetHtml({
      title: "Counter — preview",
      plan: { name: "5 GB", validityLabel: "" },
      logoUrl: "https://saleslip.app/brand/guilders-logo.png",
      vouchers: [{ code: "SLAAA00", qrSvg: "<svg></svg>" }],
    });
    expect(html).toContain("5 GB");
    expect(html).not.toContain("Valid ");
  });

  it("keeps the price off the card even when the plan carries one", () => {
    const html = sheet(1);
    expect(html).not.toContain("₦");
    expect(html).not.toContain("1,000");
  });
});
