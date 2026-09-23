import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/app/styles.css";

import { Providers } from "@/components/providers";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { Toaster } from "@turbo/ui/components/sonner";
import { ThemeProvider } from "@turbo/ui/components/theme";

const interDisplay = localFont({
  src: [
    {
      path: "../fonts/InterDisplay-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/InterDisplay-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/InterDisplay-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/InterDisplay-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://saleslip.app"),
  title: "Saleslip — Buy WiFi, go online in seconds",
  description:
    "Choose a plan, pay with your card, and get a voucher code that connects you to the internet instantly. No account needed.",
  openGraph: {
    title: "Saleslip — Buy WiFi, go online in seconds",
    description:
      "Choose a plan, pay with your card, and get a voucher code that connects you to the internet instantly. No account needed.",
    url: "https://saleslip.app",
    siteName: "Saleslip",
  },
  twitter: {
    card: "summary_large_image",
    title: "Saleslip — Buy WiFi, go online in seconds",
    description:
      "Choose a plan, pay with your card, and get a voucher code that connects you to the internet instantly. No account needed.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${interDisplay.className} ${interDisplay.variable} antialiased`}
      >
        <ThemeProvider>
          <NuqsAdapter>
            <Providers>
              {children}
              <SpeedInsights />
              <Analytics />
            </Providers>
          </NuqsAdapter>

          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
