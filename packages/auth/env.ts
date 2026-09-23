import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

import { shouldSkipEnvValidation } from "@turbo/shared/env";

/** Non-empty string, empty string, or missing var — only the first counts as set. */
const optionalString = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().min(1).optional(),
);

export function authEnv() {
  const skipStrict = shouldSkipEnvValidation();

  return createEnv({
    server: {
      AUTH_SECRET: skipStrict ? optionalString : z.string().min(1),
      SUPABASE_JWT_SECRET: optionalString,
      GITHUB_CLIENT_ID: z.string().optional(),
      GITHUB_CLIENT_SECRET: z.string().optional(),
      ADMIN_EMAILS: optionalString,
      NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    },
    runtimeEnv: process.env,
    skipValidation: skipStrict,
  });
}
