import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

import { authEnv } from "@turbo/auth/env";
import { shouldSkipEnvValidation } from "@turbo/shared/env";

/** Non-empty value, empty string, or missing var — only the first counts as set. */
const optionalUrl = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.url().optional(),
);
/** Non-empty string, empty string, or missing var — only the first counts as set. */
const optionalStr = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().min(1).optional(),
);

export const env = createEnv({
  extends: [authEnv(), vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    POSTGRES_URL: z.url(),
    /**
     * Origin of `apps/server`, the only runtime with a route to the hotspot.
     * The console's `/api/wifi-router` proxy forwards here.
     */
    SERVER_URL: z.url().default("http://localhost:3001"),
    /**
     * RouterOS hotspot profiles the admin console mints against. Optional so
     * the dashboard still builds without the hotspot configured; each falls
     * back to the default profile name on the router.
     */
    WIFI_PROFILE_DAY_1: optionalStr,
    WIFI_PROFILE_DAY_2: optionalStr,
    WIFI_PROFILE_WEEK_1: optionalStr,
    WIFI_PROFILE_WEEK_2: optionalStr,
    WIFI_PROFILE_MONTH_1: optionalStr,
    WIFI_PROFILE_MONTH_2: optionalStr,
    ADMIN_EMAILS: optionalStr,
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_PORT: z.string().default("3000"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalStr,
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_PORT: process.env.NEXT_PUBLIC_PORT,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  skipValidation: shouldSkipEnvValidation(),
});
