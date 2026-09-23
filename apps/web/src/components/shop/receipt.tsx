"use client";

import type { ShopOrder } from "@/hooks/use-shop-order";
import Link from "next/link";
import { useShopOrder } from "@/hooks/use-shop-order";
import { toast } from "sonner";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@turbo/ui/components/card";
import { Spinner } from "@turbo/ui/components/spinner";
import { formatNaira } from "@turbo/wifi";

const supportLine = (order: ShopOrder) =>
  order.supportPhone ? (
    <a
      href={`tel:${order.supportPhone}`}
      className="font-medium hover:underline"
    >
      {order.supportPhone}
    </a>
  ) : (
    "our support team"
  );

const Loading = () => (
  <Card className="w-full max-w-md gap-4">
    <CardHeader className="items-center text-center">
      <CardTitle>Loading your order…</CardTitle>
    </CardHeader>
    <CardContent className="flex justify-center">
      <Spinner className="text-primary" />
    </CardContent>
  </Card>
);

const Processing = () => (
  <Card className="w-full max-w-md gap-4">
    <CardHeader className="items-center text-center">
      <CardTitle>Confirming your payment</CardTitle>
      <CardDescription>
        We're waiting for Paystack to confirm your payment. This page updates
        automatically — please keep it open.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex justify-center">
      <Spinner className="text-primary" />
    </CardContent>
  </Card>
);

const Failed = ({ order }: { order: ShopOrder }) => (
  <Card className="w-full max-w-md gap-4">
    <CardHeader className="items-center text-center">
      <Badge variant="destructive">Payment failed</Badge>
      <CardTitle>We couldn't complete your order</CardTitle>
      <CardDescription>
        You haven't been charged. Please try again, or contact{" "}
        {supportLine(order)} for help.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex justify-center">
      <Button asChild>
        <Link href="/#plans">Try again</Link>
      </Button>
    </CardContent>
  </Card>
);

const Voucher = ({ order }: { order: ShopOrder }) => (
  <Card className="w-full max-w-md gap-4">
    <CardHeader className="items-center text-center">
      <Badge variant="success">Connected</Badge>
      <CardTitle>You're online</CardTitle>
      <CardDescription>
        Join the Saleslip network and enter this voucher code to connect.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col items-center gap-4">
      {order.qrSvg ? (
        <div
          className="rounded-lg p-3 [&_svg]:block"
          dangerouslySetInnerHTML={{ __html: order.qrSvg }}
        />
      ) : null}
      <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
        <code className="font-mono text-lg font-semibold tracking-wider">
          {order.voucherCode}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            if (order.voucherCode) {
              await navigator.clipboard.writeText(order.voucherCode);
              toast.success("Voucher code copied");
            }
          }}
        >
          Copy
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {order.plan?.name ?? "Your plan"} · {formatNaira(order.amountKobo)}
      </p>
    </CardContent>
  </Card>
);

const NotFound = () => (
  <Card className="w-full max-w-md gap-4">
    <CardHeader className="items-center text-center">
      <CardTitle>Order not found</CardTitle>
      <CardDescription>
        We couldn't find that order. If you just paid, contact our support team
        and we'll sort it out.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex justify-center">
      <Button asChild>
        <Link href="/#plans">Buy a plan</Link>
      </Button>
    </CardContent>
  </Card>
);

const ErrorState = () => (
  <Card className="w-full max-w-md gap-4">
    <CardHeader className="items-center text-center">
      <CardTitle>Something went wrong</CardTitle>
      <CardDescription>
        We couldn't load your order. Refresh the page to try again.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex justify-center">
      <Button variant="outline" onClick={() => window.location.reload()}>
        Refresh page
      </Button>
    </CardContent>
  </Card>
);

export const Receipt = ({ orderId }: { orderId: string }) => {
  const { data: order, isLoading, isError } = useShopOrder(orderId);

  if (isLoading) return <Loading />;
  if (isError) return <ErrorState />;
  if (!order) return <NotFound />;

  if (order.status === "failed") return <Failed order={order} />;
  if (order.status === "fulfilled") return <Voucher order={order} />;
  return <Processing />;
};
