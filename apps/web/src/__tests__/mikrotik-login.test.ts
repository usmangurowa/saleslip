import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The MikroTik captive portal page is a deployable artifact: if the router
 * templating placeholders go missing, every hotspot login silently breaks.
 * These checks keep the file honest without needing a router.
 */
describe("mikrotik login.html", () => {
  const html = readFileSync("public/mikrotik/login.html", "utf8");

  it("posts to the router login link and preserves the redirect target", () => {
    expect(html).toContain('action="$(link-login-only)"');
    expect(html.match(/\$\(link-orig\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the stock CHAP/PAP form mechanics", () => {
    expect(html).toContain('name="sendin"');
    expect(html).toContain('name="login"');
    expect(html).toContain('onsubmit="return doLogin()"');
    expect(html).toContain('<script src="/md5.js"></script>');
    expect(html).toContain('"$(chap-challenge)" == ""');
    expect(html).toContain("hexMD5");
  });

  it("submits the voucher as both username and password", () => {
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
    expect(html).toContain("document.login.username.value = voucher");
    expect(html).toContain("document.login.password.value = voucher");
    expect(html).toContain("document.sendin.username.value = voucher");
  });

  it("renders router-side auth errors", () => {
    expect(html).toContain("$(if error)");
    expect(html).toContain("$(error)");
    expect(html).toContain("$(endif)");
  });

  it("is fully self-contained — no external requests", () => {
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(html).not.toMatch(/@import|url\(/);
    expect(html).not.toMatch(/fonts\.googleapis|cdn\./);
  });

  it("auto-focuses the voucher input", () => {
    expect(html).toContain('getElementById("voucher").focus()');
  });
});
