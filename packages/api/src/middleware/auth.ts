import { createMiddleware } from "hono/factory";

import { resolveAllowlist } from "@turbo/shared";

import type { AppContext } from "../context";

/**
 * Auth middleware that ensures user is authenticated
 * Returns 401 if no valid session exists
 */
export const authMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const session = c.get("session");
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

/**
 * Parse the `ADMIN_EMAILS` allowlist (comma-separated). Each value is
 * trimmed and lowercased so comparison is case-insensitive and tolerates
 * human-entered spacing.
 */
export const resolveAdminEmails = (raw = process.env.ADMIN_EMAILS): string[] =>
  resolveAllowlist(raw);

/**
 * Authoritative admin check. An empty allowlist admits no one — `ADMIN_EMAILS`
 * must be set for any account to operate the WiFi console — so a deployment
 * that forgets the variable is locked down rather than open.
 */
export const isAdminEmail = (
  email: string | null | undefined,
  adminEmails: readonly string[] = resolveAdminEmails(),
): boolean => {
  if (!email || adminEmails.length === 0) return false;
  return adminEmails.includes(email.trim().toLowerCase());
};

/**
 * Admin middleware for the WiFi console (phone numbers, revenue, and live
 * router control). Stricter than `authMiddleware`: 401 when unauthenticated,
 * 403 for an authenticated user whose email is not allowlisted.
 */
export const adminMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const session = c.get("session");
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!isAdminEmail(session.user.email)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
