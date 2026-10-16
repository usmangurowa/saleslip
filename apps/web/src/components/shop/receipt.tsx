"use client";

import { useState } from "react";
import Link from "next/link";
import { useShopOrder } from "@/hooks/use-shop-order";
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  Tick02Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@turbo/ui/components/card";
import { Icon } from "@turbo/ui/components/icon";
import { Spinner } from "@turbo/ui/components/spinner";
import { formatData, formatNaira } from "@turbo/wifi";

const PENDING_STATUSES = new Set(["pending", "paid", "pending_router"]);

export const Receipt = ({ orderId }: { orderId: string }) => {
  const { data: order, isLoading, isError, refetch } = useShopOrder(orderId);
  const [copied, setCopied] = useState(false);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — code is still selectable on screen.
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full" data-slot="receipt-loading">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Spinner className="size-6" />
          <p className="text-muted-foreground text-sm">Loading your order...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError || !order) {
    return (
      <Card className="w-full" data-slot="receipt-error">
        <CardHeader>
          <CardTitle>Order not found</CardTitle>
          <CardDescription>
            We couldn&apos;t find this order. Check the link in your payment
            confirmation or buy a new plan.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full" variant="outline">
            <Link href="/buy">Back to plans</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const isPending = PENDING_STATUSES.has(order.status);
  const isFulfilled =
    order.status === "fulfilled" && Boolean(order.voucherCode);
  const isFailed = order.status === "failed" || order.status === "cancelled";
  const brandName = order.brandName ?? "Saleslip WiFi";

  return (
    <Card className="w-full" data-slot="receipt">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">
              {order.plan?.name ?? "WiFi Pass"}
            </CardTitle>
            <CardDescription>{brandName}</CardDescription>
          </div>
          {isFulfilled && (
            <Badge variant="secondary" className="gap-1">
              <Icon icon={CheckmarkCircle02Icon} className="text-success" />
              Ready to use
            </Badge>
          )}
          {isPending && <Badge variant="outline">Confirming</Badge>}
          {isFailed && <Badge variant="destructive">Not completed</Badge>}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {isFulfilled && order.voucherCode && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-muted/60 flex w-full flex-col items-center gap-3 rounded-xl border p-6 text-center">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Your voucher code
              </span>
              <code
                className="font-mono text-3xl font-semibold tracking-widest select-all md:text-4xl"
                data-slot="voucher-code"
              >
                {order.voucherCode}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyCode(order.voucherCode ?? "")}
              >
                <Icon icon={copied ? Tick02Icon : Copy01Icon} />
                {copied ? "Copied" : "Copy code"}
              </Button>
            </div>

            {order.loginUrl && (
              <form
                method="POST"
                action={order.loginUrl}
                className="w-full"
                data-slot="captive-portal-login"
              >
                <input
                  type="hidden"
                  name="username"
                  value={order.voucherCode}
                />
                <input
                  type="hidden"
                  name="password"
                  value={order.voucherCode}
                />
                <input
                  type="hidden"
                  name="dst"
                  value="http://neverssl.com"
                />
                <Button type="submit" size="lg" className="w-full">
                  <Icon icon={Wifi01Icon} />
                  Connect now
                </Button>
              </form>
            )}

            {order.qrSvg && (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="size-40 rounded-lg border bg-white p-2 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: order.qrSvg }}
                />
                <span className="text-muted-foreground text-xs">
                  Scan on another device to copy the code
                </span>
              </div>
            )}

            <div className="bg-accent/50 flex w-full items-start gap-3 rounded-lg p-4 text-sm">
              <Icon
                icon={Wifi01Icon}
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              <div className="flex flex-col gap-1">
                <span className="font-medium">How to connect</span>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Join the <strong>{brandName}</strong> WiFi network, open
                  the login prompt, and enter this code as both username and
                  password.
                </p>
              </div>
            </div>
          </div>
        )}

        {isPending && (
          <div className="bg-muted/40 flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
            <Spinner className="size-6" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {order.status === "pending"
                  ? "Waiting for Paystack confirmation..."
                  : "Generating your voucher on the router..."}
              </p>
              <p className="text-muted-foreground text-xs">
                This page updates automatically every few seconds.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
            >
              Check again now
            </Button>
          </div>
        )}

        {isFailed && (
          <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-xl border p-4 text-sm">
            <p className="font-medium">This payment was not completed.</p>
            <p className="text-muted-foreground text-xs">
              If you were debited, keep your reference below and contact
              support.
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-y-2 border-t pt-4 text-xs">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="text-right font-medium">
            {formatNaira(order.amountKobo)}
          </dd>
          {order.plan && (
            <>
              <dt className="text-muted-foreground">Validity</dt>
              <dd className="text-right font-medium">
                {order.plan.validityLabel}
                {order.plan.dataLimitBytes ? ` · ${formatData(order.plan.dataLimitBytes)}` : ""}
              </dd>
            </>
          )}
          {order.reference && (
            <>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="text-right font-mono">{order.reference}</dd>
            </>
          )}
        </dl>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 border-t pt-4">
        <Button asChild variant="outline" className="w-full">
          <Link href="/buy">Buy another voucher</Link>
        </Button>
        {order.supportPhone && (
          <p className="text-muted-foreground text-center text-xs">
            Need help? Call or WhatsApp{" "}
            <a
              href={`tel:${order.supportPhone}`}
              className="text-foreground font-medium underline underline-offset-4"
            >
              {order.supportPhone}
            </a>
          </p>
        )}
      </CardFooter>
    </Card>
  );
};
