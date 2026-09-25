import { describe, expect, it } from "vitest";

// Renders every template through the full react-email pipeline. Regression
// guard for the classic-JSX runtime crash ("React is not defined") seen in
// production when the package resolves from a flattened node_modules.
describe("email templates render", () => {
  it("renders the voucher email HTML", async () => {
    const { VoucherEmail } = await import("../templates/voucher");
    const { renderEmail } = await import("../client");
    const html = await renderEmail(
      VoucherEmail({
        planName: "1 Day · 1 Device",
        priceLabel: "₦1,000",
        validityLabel: "24 hours",
        deviceCount: 1,
        code: "SLABC123",
        supportPhone: "+2348010000000",
      }),
    );
    expect(html).toContain("SLABC123");
    expect(html).not.toContain("Bonus");
    expect(html).toContain("+2348010000000");
  });

  it("renders the OTP email HTML", async () => {
    const { OTPEmail } = await import("../templates/otp");
    const { renderEmail } = await import("../client");
    const html = await renderEmail(OTPEmail({ otp: "246810", type: "sign-in" }));
    expect(html).toContain("246810");
  });

  it("renders the welcome email HTML", async () => {
    const { WelcomeEmail } = await import("../templates/welcome");
    const { renderEmail } = await import("../client");
    const html = await renderEmail(
      WelcomeEmail({ name: "Ada", actionUrl: "https://saleslip.app", actionText: "Open dashboard" }),
    );
    expect(html).toContain("Ada");
  });

  it("renders the support email HTML", async () => {
    const { SupportEmail } = await import("../templates/support");
    const { renderEmail } = await import("../client");
    const html = await renderEmail(
      SupportEmail({ userEmail: "ada@example.com", type: "issue", message: "My voucher did not work" }),
    );
    expect(html).toContain("My voucher did not work");
  });
});
