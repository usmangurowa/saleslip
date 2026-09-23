import { afterAll, describe, expect, it } from "vitest";

import { authEnv } from "../../env";

// Regression: the optionalString helper used to reject `undefined` input, so
// any missing optional var (e.g. ADMIN_EMAILS) crashed strict environments.

describe("authEnv", () => {
  const snapshot = { ...process.env } as Record<string, string | undefined>;

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }

    Object.assign(process.env, snapshot);
  });

  it("tolerates entirely missing optional vars", () => {
    delete process.env.SKIP_ENV_VALIDATION;
    delete process.env.CI;
    delete process.env.ADMIN_EMAILS;
    delete process.env.SUPABASE_JWT_SECRET;
    process.env.AUTH_SECRET ??= "test-auth-secret";

    const auth = authEnv();

    expect(auth.ADMIN_EMAILS).toBeUndefined();
    expect(auth.SUPABASE_JWT_SECRET).toBeUndefined();
  });
});
