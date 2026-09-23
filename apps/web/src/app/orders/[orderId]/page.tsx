import { redirect } from "next/navigation";

/**
 * Paystack returns the browser to `${PUBLIC_BASE_URL}/orders/:id` after
 * payment (see `startCheckout` on the server). `PUBLIC_BASE_URL` is the web
 * origin in production, so this route just bounces the customer to the
 * storefront receipt at `/receipt/:id`.
 */

// `orderId` is runtime data, so this route can't be prerendered.
export const instant = false;

export default async function OrderRedirectPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  redirect(`/receipt/${orderId}`);
}
