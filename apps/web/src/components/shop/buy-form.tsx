"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { BuyOrderFormData } from "@turbo/validators";
import type { WifiPlan } from "@turbo/wifi";
import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Input } from "@turbo/ui/components/input";
import { Spinner } from "@turbo/ui/components/spinner";
import { buyOrderSchema } from "@turbo/validators";
import { formatNaira } from "@turbo/wifi";

interface BuyFormProps {
  plan: WifiPlan;
}

interface OrderResponse {
  ok: boolean;
  orderId?: string;
  authorizationUrl?: string;
  reason?: string;
  message?: string;
}

export const BuyForm = ({ plan }: BuyFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BuyOrderFormData>({
    resolver: zodResolver(buyOrderSchema),
    defaultValues: { planId: plan.id, phone: "", email: "" },
  });

  const onSubmit = async (data: BuyOrderFormData) => {
    const res = await fetch("/api/shop/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => null)) as OrderResponse | null;

    if (!body?.ok || !body.authorizationUrl) {
      toast.error(
        body?.message ?? "We couldn't start your payment. Please try again.",
      );
      return;
    }

    window.location.assign(body.authorizationUrl);
  };

  return (
    <div className="w-full max-w-md">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold">{plan.name}</h1>
            <Badge variant="secondary" className="shrink-0">
              {plan.validityLabel}
            </Badge>
          </CardTitle>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-3xl font-semibold tracking-tight">
              {formatNaira(plan.priceKobo)}
            </span>
            <span className="text-muted-foreground text-sm">
              Unlimited data
            </span>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <input type="hidden" {...register("planId")} />

              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="phone">Phone number</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="0803 123 4567"
                  className="h-11"
                  aria-invalid={!!errors.phone}
                  {...register("phone")}
                />
                <FieldDescription>
                  We'll send your voucher here as a backup.
                </FieldDescription>
                <FieldError>{errors.phone?.message}</FieldError>
              </Field>

              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">
                  Email{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                <FieldError>{errors.email?.message}</FieldError>
              </Field>

              <Field>
                <Button
                  type="submit"
                  className="h-11 w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  Pay {formatNaira(plan.priceKobo)}
                </Button>
                <FieldDescription className="text-center">
                  You'll be redirected to Paystack to pay securely by card or
                  bank transfer.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
