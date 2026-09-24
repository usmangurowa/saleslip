import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { env } from "@/env";
import { nextCookies } from "better-auth/next-js";

import { createAppAuth } from "@turbo/auth";

// Better Auth derives the session cookie name from the baseURL protocol
// (`__Secure-` prefix for https). The API server runs behind https, so the
// web app must issue its session cookie with the same name or the server
// rejects every authenticated request with 401. Vercel's VERCEL_ENV is not
// set on Coolify, so the https app URL wins whenever it is configured.
const baseUrl =
  env.VERCEL_ENV === "preview" && env.VERCEL_URL
    ? `https://${env.VERCEL_URL}`
    : env.NEXT_PUBLIC_APP_URL.startsWith("https://")
      ? env.NEXT_PUBLIC_APP_URL
      : "http://localhost:3000";

export const auth = createAppAuth({
  baseUrl,
  productionUrl: env.NEXT_PUBLIC_APP_URL,
  extraPlugins: [nextCookies()],
});

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
