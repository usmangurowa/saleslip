import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { Receipt } from "@/components/shop/receipt";

export const metadata: Metadata = {
  title: "Your order — Saleslip",
  description: "Track your payment and get your WiFi voucher code.",
};

// `orderId` is runtime data, so this route can't be prerendered.
export const instant = false;

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <div className="bg-background min-h-svh">
      <LandingNav />
      <main className="container flex flex-col items-center py-16">
        <Receipt orderId={orderId} />
      </main>
    </div>
  );
}
