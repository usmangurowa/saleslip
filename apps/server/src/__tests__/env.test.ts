import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { env as ServerEnv } from "../env";

// Regression: a server deploy crashed at boot because the optional
// WIFI_PROFILE_* vars were missing entirely — the optionalString helper used
// to reject `undefined` input (it only tolerated empty strings). These tests
// boot the real schema with every optional var missing.

describe("server env schema", () => {
  const snapshot = { ...process.env } as Record<string, string | undefined>;
  let env: typeof ServerEnv;

  beforeAll(async () => {
    delete process.env.SKIP_ENV_VALIDATION;
    delete process.env.CI;

    // Only the required vars; every optional var stays missing.
    process.env.POSTGRES_URL ??=
      "postgres://postgres:postgres@localhost:5432/saleslip";
    process.env.AUTH_SECRET ??= "test-auth-secret";

    ({ env } = await import("../env"));
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }

    Object.assign(process.env, snapshot);
  });

  it("boots with every optional var missing", () => {
    expect(env.WIFI_PROFILE_DAY_1).toBeUndefined();
    expect(env.WIFI_PROFILE_MONTH_2).toBeUndefined();
    expect(env.ADMIN_EMAILS).toBeUndefined();
    expect(env.ROUTER_HOST).toBeUndefined();
  });

  it("falls back to defaults for required-with-default fields", () => {
    expect(env.BRAND_NAME).toBe("Saleslip Starlink");
    expect(env.SERVER_PORT).toBe(3001);
  });
});
