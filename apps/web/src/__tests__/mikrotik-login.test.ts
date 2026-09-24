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
    // The challenge hex in an attribute doubles as the no-CHAP detector.
    expect(html).toContain('id="chap-challenge" value="$(chap-challenge)"');
    expect(html).toContain('challenge == ""');
    // RouterOS http-chap: MD5 over chap-id + password + chap-challenge,
    // concatenated into a single string — hexMD5 takes one argument.
    // chap-id MUST be substituted inside a JS string literal (vendor
    // pattern): RouterOS emits it as a backslash-octal JS escape for
    // non-printable bytes, which only the JS engine in a string literal
    // decodes back to the raw byte. In an HTML attribute the browser
    // keeps the literal "\023" text and the hash is computed over the
    // wrong string — every login then fails "invalid username or
    // password".
    expect(html).toContain(
      "hexMD5('$(chap-id)' + voucher + '$(chap-challenge)')",
    );
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
    // $(error) and friends are only allowed inside HTML blocks — a
    // substituted string inside a JS string literal can break the whole
    // inline script. The ONE exception is the CHAP pair: RouterOS
    // substitutes $(chap-id) as a backslash-octal JS escape (e.g. \023),
    // so it is only correct inside a JS string literal, where the engine
    // decodes the escape back to the raw byte. $(chap-challenge) is plain
    // hex but rides along in the same literal, mirroring the vendor page.
    const scriptBlocks = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    for (const block of scriptBlocks) {
      const substitutions = block.match(/\$\([^)]*\)/g) ?? [];
      const allowed = ["$(chap-id)", "$(chap-challenge)"];
      const illegal = substitutions.filter((s) => !allowed.includes(s));
      expect(illegal).toEqual([]);
    }
  });

  it("is self-contained — every external link is the walled-garden storefront", () => {
    // External URLs are banned except the storefront: the buy button and
    // the six price rows (with a plan preselected). Its host must be
    // allowed in the hotspot walled garden or the links dead-end pre-auth.
    const external = html.match(/(?:src|href)="https?:\/\/[^"]*"/g) ?? [];
    expect(external).toHaveLength(7);
    for (const href of external) {
      expect(href.startsWith('href="https://api.saleslip.app/?login=')).toBe(
        true,
      );
    }
    expect(html).not.toMatch(/@import|url\(/);
    expect(html).not.toMatch(/fonts\.googleapis|cdn\./);
  });

  it("hands the portal context to the storefront for post-payment auto-connect", () => {
    // The receipt page POSTs the generated voucher straight back to the
    // router login link — it needs login/mac/ip to reproduce this session.
    expect(html).toContain(
      "https://api.saleslip.app/?login=$(link-login-only)&amp;mac=$(mac)&amp;ip=$(ip)",
    );
  });

  it("links each price row to the storefront with that plan preselected", () => {
    // One row per plan; the planId query param preselects the plan radio
    // on the buy page (unknown ids fall back to the first plan there).
    const planIds = ["day-1", "week-1", "month-1", "day-2", "week-2", "month-2"];
    for (const planId of planIds) {
      expect(html).toContain(
        `href="https://api.saleslip.app/?login=$(link-login-only)&amp;mac=$(mac)&amp;ip=$(ip)&amp;planId=${planId}"`,
      );
    }
  });

  it("reveals a confirm panel before firing the once-per-device trial login", () => {
    // The walled garden is closed pre-login, so the buy links only work
    // once online: the 5-minute trial is the guest's path to the store.
    // RouterOS hides the block via $(if trial == 'yes') once the device
    // has spent its trial. T-$(mac-esc) is the vendor's per-MAC trial
    // pseudo-username — no password — and dst is the storefront URL
    // percent-encoded as a nested query value, so a successful trial
    // login lands the guest on the buy page with their portal context
    // (login/mac/ip) for post-payment auto-connect.
    //
    // On phones the OS closes the portal sheet the moment the trial
    // session starts, so nothing after login is ever seen. The first
    // tap only reveals a confirm panel (visible pre-login, ES3-safe
    // inline JS); the real trial href — moved onto "Connect now" —
    // fires the login only after the guest has read where to buy.
    expect(html).toContain("$(if trial == 'yes')");
    expect(html).toContain('id="trial-confirm"');
    expect(html).toContain("saleslip.app/buy");
    expect(html).toContain(
      'href="$(link-login-only)?dst=https%3A%2F%2Fapi.saleslip.app%2F%3Flogin%3D$(link-login-only-esc)%26mac%3D$(mac-esc)%26ip%3D$(ip-esc)&amp;username=T-$(mac-esc)"',
    );
  });

  it("auto-focuses the voucher input", () => {
    expect(html).toContain('getElementById("voucher").focus()');
  });

  it("uses the wifi brand mark and lean voucher-field copy", () => {
    // The logo is the Saleslip wifi symbol (same paths as the web app
    // icon at apps/web/src/app/icon.svg), and the voucher field copy
    // stays lean: a code-shaped placeholder mirroring the platform's
    // 4-letters-then-4-digits generator, with no "e.g." prefix and no
    // pointer to reception.
    expect(html).toContain('d="M2.5 9.5a13.5 13.5 0 0 1 19 0"');
    expect(html).toContain('placeholder="abcd1234"');
    expect(html).not.toContain('placeholder="e.g.');
    expect(html).not.toContain("Ask reception");
  });

  it("is ES3-safe for old captive-portal browsers", () => {
    const scriptBlocks = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    const inline = scriptBlocks.join("\n");
    expect(inline).not.toContain(".trim(");
    expect(inline).not.toContain(".hidden");
    expect(inline).not.toContain("=>");
    expect(inline).not.toContain("const ");
    expect(inline).not.toContain("let ");
    // textContent is missing in IE8 — use innerHTML for the static
    // client-side error message instead.
    expect(inline).not.toContain(".textContent");
  });

  it("has no trailing commas — they are ES2017 syntax and break pre-2017 parsers", () => {
    // A trailing comma in a FUNCTION CALL (f(a, b,)) makes IE8-era
    // browsers throw a SyntaxError at parse time: doLogin never gets
    // defined, the form submits natively with an empty password, and
    // every login fails with "invalid username or password". Prettier
    // adds these when it wraps a call across lines — this guard keeps
    // them out of the deployable artifact.
    const scriptBlocks = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    for (const block of scriptBlocks) {
      expect(block).not.toMatch(/,\s*\)/);
      expect(block).not.toMatch(/,\s*\]/);
      expect(block).not.toMatch(/,\s*\}/);
    }
  });
});
