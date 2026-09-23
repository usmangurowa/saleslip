import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

import { authEnv } from "@turbo/auth/env";
import { shouldSkipEnvValidation } from "@turbo/shared/env";

/** Non-empty string, empty string, or missing var — only the first counts as set. */
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const env = createEnv({
  extends: [authEnv()],
  server: {
    SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    BRAND_NAME: z.string().min(1).default("Saleslip Starlink"),
    SERVER_URL: z.url().default("http://localhost:3001"),
    APP_URL: z.url().default("http://localhost:3000"),
    POSTGRES_URL: z.url(),
    RESEND_API_KEY: optionalString,
  },
  runtimeEnv: {
    ...process.env,
    SERVER_PORT: process.env.SERVER_PORT ?? process.env.PORT,
  },
  skipValidation: shouldSkipEnvValidation(),
});
