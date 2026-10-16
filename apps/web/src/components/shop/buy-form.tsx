"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCardIcon, LockIcon } from "@hugeicons/core-free-icons";
import { Controller, useForm } from "react-hook-form";

import type { BuyOrderFormData, BuyOrderInput } from "@turbo/validators";
import type { WifiPlan } from "@turbo/wifi";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@turbo/ui/components/field";
import { Icon } from "@turbo/ui/components/icon";
import { Input } from "@turbo/ui/components/input";
import { Spinner } from "@turbo/ui/components/spinner";
import { buyOrderSchema } from "@turbo/validators";
import { formatData, formatNaira } from "@turbo/wifi";

import type { PortalContext } from "./plan-card";

interface CreateOrderResponse {
  orderId?: string;
  authorizationUrl?: string;
  error?: string;
}

export const BuyForm = ({
  plan,
  portal,
}: {
  plan: WifiPlan;
  portal?: PortalContext;
}) => {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<BuyOrderInput, unknown, BuyOrderFormData>({
    resolver: zodResolver(buyOrderSchema),
    defaultValues: {
      planId: plan.id,
      email: "",
      phone: "",
      mac: portal?.mac,
      ip: portal?.ip,
      login: portal?.login,
    },
  });

  const onSubmit = async (values: BuyOrderFormData) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          ...values,
          mac: portal?.mac,
          ip: portal?.ip,
          login: portal?.login,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as CreateOrderResponse;

      if (!res.ok) {
        setSubmitError(
          body.error ??
            "We could not start the payment right now. Please try again.",
        );
        return;
      }

      if (!body.authorizationUrl) {
        setSubmitError("Payment gateway did not provide a redirect URL.");
        return;
      }

      window.location.assign(body.authorizationUrl);
    } catch {
      setSubmitError("Network error. Please check your connection and retry.");
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <Card className="w-full" data-slot="buy-form">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">{plan.name}</CardTitle>
            <CardDescription>{plan.description}</CardDescription>
          </div>
          {plan.validityLabel ? (
            <Badge variant="secondary" className="shrink-0">
              {plan.validityLabel}
            </Badge>
          ) : null}
        </div>
        <div className="border-t pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-sm">Total</span>
            <span className="text-2xl font-semibold tracking-tight">
              {formatNaira(plan.priceKobo)}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {formatData(plan.dataLimitBytes)} data &middot; code shown right
            after payment
          </p>
        </div>
      </CardHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    Email{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    We&apos;ll email you a copy of your voucher code so you can
                    find it later.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="phone"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    Phone number{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0801 234 5678"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Used only if we need to reach you about your order.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {submitError && (
              <p
                role="alert"
                className="text-destructive text-sm font-medium"
                data-slot="buy-form-error"
              >
                {submitError}
              </p>
            )}
          </FieldGroup>
        </CardContent>

        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner />
                Redirecting to Paystack...
              </>
            ) : (
              <>
                <Icon icon={CreditCardIcon} />
                Pay {formatNaira(plan.priceKobo)} with Paystack
              </>
            )}
          </Button>
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
            <Icon icon={LockIcon} className="size-3.5" />
            Secured by Paystack &middot; card or bank transfer
          </p>
        </CardFooter>
      </form>
    </Card>
  );
};
