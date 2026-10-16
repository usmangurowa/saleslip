import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins/email-otp";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";

import { db } from "@turbo/db/client";
import { sendOTPEmail } from "@turbo/mail/client";
import { resolveAllowlist } from "@turbo/shared";

import { authEnv } from "../env";
import { shouldAllowUserCreate } from "./allowlist";
import { BASE_TRUSTED_ORIGINS, resolveTrustedOrigins } from "./trusted-origins";

type OTPType =
  "sign-in" | "email-verification" | "forget-password" | "change-email";

interface SendOTPEmailParams {
  email: string;
  otp: string;
  type: OTPType;
}

interface InitAuthOptions<TExtraPlugins extends BetterAuthPlugin[] = []> {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;
  /**
   * Callback to send OTP emails for verification, password reset, etc.
   */
  sendOTPEmail?: (params: SendOTPEmailParams) => Promise<void>;
  /**
   * Optional admin email allowlist. When provided, only these emails may
   * create an account; an empty array admits no one. Omit to leave
   * registration open (used by the auth CLI and tests).
   */
  adminEmails?: readonly string[];
  extraPlugins?: TExtraPlugins;
}

export const initAuth = <TExtraPlugins extends BetterAuthPlugin[] = []>(
  options: InitAuthOptions<TExtraPlugins>,
) => {
  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    databaseHooks: {
      user: {
        create: {
          // Authoritative signup gate: when an allowlist is configured, only
          // those emails may create an account. Omitted allowlist = open.
          before: (user) =>
            shouldAllowUserCreate(user.email, options.adminEmails)
              ? Promise.resolve()
              : Promise.resolve(false),
        },
      },
    },
    baseURL: options.baseUrl,
    secret: options.secret,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes - cache session in cookie to prevent refetches
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    user: {
      additionalFields: {
        username: {
          type: "string",
          unique: true,
          required: false,
        },
      },
    },
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          if (options.sendOTPEmail) {
            await options.sendOTPEmail({ email, otp, type });
          }
        },
      }),
      ...(options.extraPlugins ?? []),
    ],
    trustedOrigins: resolveTrustedOrigins(
      ...BASE_TRUSTED_ORIGINS,
      options.baseUrl,
      options.productionUrl,
    ),
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
};

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];

interface CreateAppAuthOptions<TExtraPlugins extends BetterAuthPlugin[] = []> {
  baseUrl: string;
  productionUrl: string;
  extraPlugins?: TExtraPlugins;
}

/**
 * App-facing auth factory. Owns everything that is identical across apps:
 * env-derived secrets and the OTP email bridge. Apps pass only their base URLs
 * and Next-specific plugins.
 */
export const createAppAuth = <TExtraPlugins extends BetterAuthPlugin[] = []>(
  options: CreateAppAuthOptions<TExtraPlugins>,
) => {
  const env = authEnv();
  return initAuth({
    baseUrl: options.baseUrl,
    productionUrl: options.productionUrl,
    secret: env.AUTH_SECRET ?? "development-secret-change-in-production",
    // The allowlist is authoritative for app instances: an unset ADMIN_EMAILS
    // yields an empty list, which closes registration rather than leaving it
    // open. initAuth (CLI/tests) omits this and stays open.
    adminEmails: resolveAllowlist(env.ADMIN_EMAILS),
    extraPlugins: options.extraPlugins,
    sendOTPEmail: async ({ email, otp, type }) => {
      await sendOTPEmail({ to: email, otp, type });
    },
  });
};
