/**
 * Signup gate: decides whether a user-creation attempt should be permitted.
 *
 * Kept as a pure function so the allowlist policy is testable without
 * standing up a database or spinning up better-auth.
 *
 * @param email    The email submitted for account creation (may be undefined).
 * @param adminEmails The configured allowlist. `undefined`/omitted = open
 *                    registration (auth CLI and tests); an empty array admits
 *                    no one.
 */
const SALESLIP_DOMAIN = "@saleslip.app";

export const shouldAllowUserCreate = (
  email: string | undefined,
  adminEmails?: readonly string[],
): boolean => {
  // Omitted allowlist means open registration.
  if (adminEmails === undefined) return true;

  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;

  // Anyone with a saleslip.app email may create an account, even if they are
  // not explicitly listed in the admin allowlist.
  if (normalized.endsWith(SALESLIP_DOMAIN)) return true;

  return adminEmails.includes(normalized);
};
