import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderEmailText, sendEmail } from "@turbo/mail/client";
import * as mailClient from "@turbo/mail/client";
import { buildPlans } from "@turbo/wifi";

import type { WifiOrderRecord, WifiVoucherRecord } from "../orders";
import { sendVoucherEmail, VOUCHER_EMAIL_SUBJECT } from "../voucher-email";

vi.mock("@turbo/mail/client", async (importOriginal) => {
  const actual = await importOriginal<typeof mailClient>();
  return {
    ...actual,
    sendEmail: vi.fn(() => Promise.resolve({ success: true, id: "email_1" })),
  };
});

const order = {
  id: "order-1",
  planId: "day-1",
  amountKobo: 100_000,
  email: "buyer@example.com",
} as unknown as WifiOrderRecord;

const voucher = { code: "SLABCDE" } as WifiVoucherRecord;
const bonus = { code: "SLBONUS" } as WifiVoucherRecord;

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

describe("sendVoucherEmail", () => {
  it("sends the receipt-style voucher email with both codes", async () => {
    const result = await sendVoucherEmail({
      to: "buyer@example.com",
      order,
      voucher,
      bonusVoucher: bonus,
      plans: buildPlans(),
      supportPhone: "+2348010000000",
    });

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendEmail).mock.calls[0]?.[0];
    if (!call) throw new Error("sendEmail not called");
    expect(call.to).toBe("buyer@example.com");
    expect(call.subject).toBe(VOUCHER_EMAIL_SUBJECT);

    const text = await renderEmailText(call.template);
    expect(text).toContain("1 Day · 1 Device");
    expect(text).toContain("Validity: 24 hours");
    expect(text).toContain("Devices: 1");
    expect(text).toContain("₦1,000");
    expect(text).toContain("SLABCDE");
    expect(text).toContain("SLBONUS");
    expect(text).toContain("+2348010000000");
  });

  it("omits the bonus block when there is no bonus voucher", async () => {
    await sendVoucherEmail({
      to: "buyer@example.com",
      order,
      voucher,
      plans: buildPlans(),
    });

    const call = vi.mocked(sendEmail).mock.calls[0]?.[0];
    if (!call) throw new Error("sendEmail not called");
    const text = await renderEmailText(call.template);
    expect(text).toContain("SLABCDE");
    expect(text).not.toContain("SLBONUS");
  });

  it("fails without sending when the plan is unknown", async () => {
    const result = await sendVoucherEmail({
      to: "buyer@example.com",
      order: { ...order, planId: "gone" },
      voucher,
      plans: buildPlans(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
