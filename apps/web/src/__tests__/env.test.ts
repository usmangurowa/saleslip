import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { env as WebEnv } from "../env";

// Regression: the optionalStr/optionalUrl helpers used to reject `undefined`
// input, so any missing optional var (e.g. WIFI_PROFILE_*) crashed boot.
// Production web is currently masked by SKIP_ENV_VALIDATION; these tests keep
// the schema honest so that crutch can be removed.

describe("web env schema", () => {
  const snapshot = { ...process.env } as Record<string, string | undefined>;
  let env: typeof WebEnv;

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
    expect(env.ADMIN_EMAILS).toBeUndefined();
  });
});
