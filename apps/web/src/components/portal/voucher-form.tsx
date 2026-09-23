"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { TurboLogo } from "@/components/turbo-logo";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@turbo/ui/components/field";
import { Input } from "@turbo/ui/components/input";
import { Button } from "@turbo/ui/components/button";
import { cn } from "@turbo/ui/lib/utils";
import { voucherFormSchema } from "@turbo/validators";

import type { VoucherFormData } from "@turbo/validators";

/**
 * Design reference for the MikroTik hotspot captive portal
 * (`apps/web/public/mikrotik/login.html`). The deployed page on the router
 * handles authentication; this form only validates the voucher shape.
 */
export const VoucherForm = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VoucherFormData>({
    resolver: zodResolver(voucherFormSchema),
  });

  const onSubmit = async (_data: VoucherFormData) => {
    // Intentionally inert: hotspot auth happens on the MikroTik router.
    await new Promise((resolve) => setTimeout(resolve, 600));
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="bg-card mb-3 flex size-12 items-center justify-center rounded-2xl border shadow-xs">
              <TurboLogo size="sm" className="text-primary" />
              <span className="sr-only">Saleslip</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              You&rsquo;re almost online
            </h1>
            <p className="text-muted-foreground text-sm text-balance">
              Enter your voucher code to get online.
            </p>
          </div>

          <Field data-invalid={!!errors.voucher}>
            <FieldLabel htmlFor="voucher">Voucher code</FieldLabel>
            <Input
              id="voucher"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              autoComplete="off"
              placeholder="e.g. 8f3k2m"
              className="h-11 text-center font-mono text-base tracking-widest"
              aria-invalid={!!errors.voucher}
              {...register("voucher")}
            />
            <FieldError>{errors.voucher?.message}</FieldError>
          </Field>

          <Field>
            <Button type="submit" className="h-11" disabled={isSubmitting}>
              Connect
            </Button>
            <FieldDescription className="text-center">
              Ask reception if you don&rsquo;t have a code. Duo vouchers work
              on two devices.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
};
