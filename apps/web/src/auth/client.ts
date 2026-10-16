import { env } from "@/env";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const baseURL = env.NEXT_PUBLIC_APP_URL;

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signUp, signOut, emailOtp } = authClient;
