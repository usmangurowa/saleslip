import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The post-login hotspot pages (alogin/status) are deployable artifacts
 * like login.html: if a router templating placeholder goes missing, the
 * guest silently loses their redirect or their session dashboard. These
 * checks keep both files honest without needing a router.
 */
describe("mikrotik alogin.html", () => {
  const html = readFileSync("public/mikrotik/alogin.html", "utf8");

  it("forwards the guest to their original destination after a beat", () => {
    // Meta refresh, not JS: the oldest portal browser honors it. The
    // beat is long (15s) so a guest who keeps the page open has time to
    // read their voucher code; on phones the OS closes the sheet long
    // before it fires anyway, so a short delay would only rush desktop
    // guests. The Continue link covers anyone who won't wait.
    expect(html).toContain(
      '<meta http-equiv="refresh" content="15; url=$(link-redirect)"',
    );
    expect(html).toContain('href="$(link-redirect)"');
  });

  it("confirms the voucher code, with a plain note for trial sessions", () => {
    // The voucher doubles as the username. Trial logins carry the ugly
    // per-MAC pseudo-username (T-$(mac)), so show a note instead; skip
    // MAC-authenticated sessions entirely.
    expect(html).toContain("$(if login-by == 'trial')");
    expect(html).toContain("$(elif login-by != 'mac')");
    expect(html).toContain('$(username)');
    expect(html).toContain("$(endif)");
  });

  it("links to the session dashboard", () => {
    expect(html).toContain('href="$(link-status)"');
  });

  it("is self-contained — no stylesheet, script, or external URL", () => {
    // The page renders behind the walled garden right after login, so
    // nothing may be fetched from the router's hotspot dir or the web.
    expect(html).not.toContain('href="css/');
    expect(html).not.toContain("<script");
    const external = html.match(/(?:src|href)="https?:\/\/[^"]*"/g) ?? [];
    expect(external).toEqual([]);
    expect(html).not.toMatch(/@import|url\(/);
  });

  it("uses the wifi brand mark from login.html", () => {
    expect(html).toContain('d="M2.5 9.5a13.5 13.5 0 0 1 19 0"');
  });
});

describe("mikrotik status.html", () => {
  const html = readFileSync("public/mikrotik/status.html", "utf8");

  it("shows the live session: voucher, time left, uptime, data", () => {
    expect(html).toContain("$(if login-by == 'trial')");
    expect(html).toContain("$(elif login-by != 'mac')");
    expect(html).toContain('$(username)');
    expect(html).toContain("$(if session-time-left)");
    expect(html).toContain("$(session-time-left)");
    expect(html).toContain("$(uptime)");
    expect(html).toContain("$(bytes-in-nice)");
    expect(html).toContain("$(bytes-out-nice)");
    expect(html).toContain("$(endif)");
  });

  it("auto-refreshes only when the hotspot profile asks it to", () => {
    // Stock behavior: the refresh meta exists only inside the
    // $(if refresh-timeout) block; a manual refresh link covers the
    // profiles (like ours) that never set it.
    expect(html).toContain("$(if refresh-timeout)");
    expect(html).toContain('content="$(refresh-timeout-secs)"');
    expect(html).toContain('href="$(link-status)"');
  });

  it("logs out through the router logout link", () => {
    // No JavaScript and no form: the logout link is a bare GET to the
    // router's session-scoped URL — works on every portal browser.
    expect(html).toContain('href="$(link-logout)"');
  });

  it("sends buyers to the storefront with portal context for auto-connect", () => {
    // Same handoff as login.html's buy links: the storefront/receipt
    // page POSTs the new voucher back to the router login link, which
    // needs login/mac/ip to reproduce this session.
    const external = html.match(/(?:src|href)="https?:\/\/[^"]*"/g) ?? [];
    expect(external).toEqual([
      'href="https://api.saleslip.app/?login=$(link-login-only)&amp;mac=$(mac)&amp;ip=$(ip)"',
    ]);
  });

  it("is self-contained — no stylesheet, script, or other external URL", () => {
    expect(html).not.toContain('href="css/');
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/@import|url\(/);
    expect(html).not.toMatch(/fonts\.googleapis|cdn\./);
  });

  it("uses the wifi brand mark from login.html", () => {
    expect(html).toContain('d="M2.5 9.5a13.5 13.5 0 0 1 19 0"');
  });
});
