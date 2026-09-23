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
    // CHAP material is read from hidden inputs so substitutions stay in
    // HTML attributes, never inside the inline script.
    expect(html).toContain('id="chap-id" value="$(chap-id)"');
    expect(html).toContain('id="chap-challenge" value="$(chap-challenge)"');
    expect(html).toContain('challenge == ""');
    // RouterOS http-chap: MD5 over chap-id + password + chap-challenge,
    // concatenated into a single string — hexMD5 takes one argument.
    expect(html).toContain("hexMD5(chapId + voucher + challenge)");
  });

  it("submits the voucher as both username and password", () => {
    expect(html).toContain('id="voucher"');
    expect(html).toContain('type="text"\n          name="username"');
    expect(html).toContain('name="password"');
    expect(html).toContain("document.login.password.value = voucher");
    expect(html).toContain("document.sendin.username.value = voucher");
  });

  it("renders router-side auth errors", () => {
    expect(html).toContain("$(if error)");
    expect(html).toContain("$(error)");
    expect(html).toContain("$(endif)");
  });

  it("keeps substitutions out of fragile JS logic", () => {
    // $(error) is only allowed inside the $(if error) HTML block — a
    // substituted error string inside a JS string literal can break the
    // whole inline script (leaving doLogin undefined and the form
    // submitting natively with missing credentials).
    const scriptBlocks = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    for (const block of scriptBlocks) {
      expect(block).not.toContain("$(");
    }
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
