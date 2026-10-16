import { z } from "zod";

// ============================================================================
// Auth Schemas
// ============================================================================

/**
 * Username validation rules:
 * - 3-20 characters
 * - Alphanumeric, underscores, hyphens only
 * - Must start with a letter
 */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    "Username must start with a letter and contain only letters, numbers, underscores, and hyphens",
  );

/**
 * Email validation schema
 */
export const emailSchema = z.string().email("Invalid email address");

/**
 * Password validation rules:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Create account form validation schema (with confirm password)
 */
export const createAccountSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateAccountFormData = z.infer<typeof createAccountSchema>;

/**
 * Forgot password form validation schema
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset password form validation schema (with confirm password)
 */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

/**
 * OTP verification schema
 */
export const otpSchema = z
  .string()
  .length(6, "Code must be 6 digits")
  .regex(/^\d+$/, "Code must contain only numbers");

export type OTPFormData = z.infer<typeof otpSchema>;

/**
 * OTP verification form validation schema
 */
export const verifyEmailSchema = z.object({
  otp: otpSchema,
});

export type VerifyEmailFormData = z.infer<typeof verifyEmailSchema>;

/**
 * Onboarding profile form validation schema
 */
export const onboardingSchema = z.object({
  username: usernameSchema,
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  avatarUrl: z.string().url("Invalid avatar URL").optional().or(z.literal("")),
});

export type OnboardingFormData = z.infer<typeof onboardingSchema>;

// ============================================================================
// WiFi Shop Schemas
// ============================================================================

/**
 * Nigerian mobile numbers: `0801 234 5678` or `+234 801 234 5678`, normalized
 * to E.164 (`+234...`). Shared by the server shop and the web `/buy` form so
 * both accept exactly the same numbers.
 */
export const nigerianPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+?234|0)[789][01]\d{8}$/,
        "Enter a valid Nigerian phone number",
      ),
  )
  .transform((value) =>
    value.startsWith("0")
      ? `+234${value.slice(1)}`
      : value.startsWith("+")
        ? value
        : `+${value}`,
  );

/**
 * Optional receipt email: empty strings are treated as absent.
 */
export const optionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(z.string().email("Enter a valid email").optional());

/**
 * Optional contact phone: empty/absent passes, but a value must be a valid
 * Nigerian number (normalized to E.164) — shared by the buy forms.
 */
export const optionalNigerianPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(nigerianPhoneSchema.optional());

const optionalPortalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const optionalLoginUrlSchema = optionalPortalText(2048).refine(
  (value) => value === undefined || /^https?:\/\//i.test(value),
  "Invalid login URL",
);

/**
 * Public `/buy` form: a plan, an optional email (voucher delivery), an
 * optional Nigerian phone, and optional MikroTik captive-portal params.
 * At least one contact field is encouraged but not enforced — buyers without
 * both still get their code on the receipt page.
 */
export const buyOrderSchema = z.object({
  planId: z.string().trim().min(1, "Choose a plan"),
  email: optionalEmailSchema,
  phone: optionalNigerianPhoneSchema,
  mac: optionalPortalText(64),
  ip: optionalPortalText(64),
  login: optionalLoginUrlSchema,
});

export type BuyOrderFormData = z.infer<typeof buyOrderSchema>;
export type BuyOrderInput = z.input<typeof buyOrderSchema>;
