import type { Metadata } from "next";

import { VoucherForm } from "@/components/portal/voucher-form";

export const metadata: Metadata = {
  title: "Guest Wi-Fi",
  description: "Enter your voucher code to get online",
  robots: { index: false, follow: false },
};

export default function PortalPage() {
  return <VoucherForm />;
}
