"use client";

import type { MintedBatch } from "@/hooks/use-wifi-router";
import * as React from "react";
import { printVoucherSheet } from "@/components/dashboard/wifi/wifi-print-sheet";
import { useWifiPlans } from "@/hooks/use-wifi";
import { useMintVoucherBatch } from "@/hooks/use-wifi-router";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Copy01Icon,
  PrinterIcon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@turbo/ui/components/alert";
import { Button } from "@turbo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@turbo/ui/components/dialog";
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
import { formatNaira } from "@turbo/wifi/format";

/** Mirrors `MAX_BATCH_QUANTITY` in `@turbo/wifi`; the server re-validates. */
const MAX_QUANTITY = 200;

const batchSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  quantity: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Mint at least one voucher")
    .max(MAX_QUANTITY, `Up to ${MAX_QUANTITY} vouchers per sheet`),
  label: z
    .string()
    .trim()
    .min(1, "Name this batch so the sheet stays traceable")
    .max(120, "Keep the label under 120 characters"),
});

/** `quantity` enters as a string and leaves as a number, so the two differ. */
type BatchFormInput = z.input<typeof batchSchema>;
type BatchFormData = z.output<typeof batchSchema>;

const todayLabel = () =>
  new Date().toLocaleDateString("en-NG", { month: "short", day: "numeric" });

/**
 * Counter-sale minting dialog.
 *
 * Two states: the form, then the minted sheet. The sheet is held in local state
 * rather than refetched because it is an artifact — once printed and handed
 * over, the codes are in the customer's hands, not ours. Generating a sheet is
 * also what activates it: the codes come back already live on the hotspot.
 */
export const WifiBatchDialog = () => {
  const [open, setOpen] = React.useState(false);
  const [minted, setMinted] = React.useState<MintedBatch | null>(null);
  const mintBatch = useMintVoucherBatch();
  const { data: plans } = useWifiPlans();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BatchFormInput, unknown, BatchFormData>({
    resolver: zodResolver(batchSchema),
    defaultValues: { planId: "", quantity: 10, label: "" },
  });

  const options = plans ?? [];
  const planName = (planId: string) =>
    options.find((plan) => plan.id === planId)?.name ??
    minted?.batch.planId ??
    planId;

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setMinted(null);
      reset();
    }
  };

  const onSubmit = (data: BatchFormData) => {
    mintBatch.mutate(data, {
      onSuccess: (result) => setMinted(result),
      onError: (error) => toast.error(error.message),
    });
  };

  const copyCodes = async () => {
    if (!minted) return;
    await navigator.clipboard.writeText(
      minted.vouchers.map((voucher) => voucher.code).join("\n"),
    );
    toast.success("Codes copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Icon icon={Ticket01Icon} />
          Generate vouchers
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {minted ? "Voucher sheet ready" : "Generate vouchers"}
          </DialogTitle>
          <DialogDescription>
            {minted
              ? `${minted.vouchers.length} live codes for ${planName(minted.batch.planId)}. Print the sheet, or copy the codes out.`
              : "Mints counter-sale codes for cash customers. Each code goes live on the hotspot as it is created, so a failure issues nothing."}
          </DialogDescription>
        </DialogHeader>

        {minted ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertTitle>These codes are already live</AlertTitle>
              <AlertDescription>
                Every one signs a customer in on the hotspot now, and their
                usage shows up under Live while they are connected.
              </AlertDescription>
            </Alert>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-dashed p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {minted.vouchers.map((voucher) => (
                  <span
                    key={voucher.id}
                    className="bg-muted/50 rounded-md px-2 py-1.5 text-center font-mono text-sm font-semibold tracking-wider"
                  >
                    {voucher.code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="wifi-batch-plan">Plan</FieldLabel>
                <select
                  id="wifi-batch-plan"
                  className="border-input bg-background focus-visible:ring-ring/30 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                  {...register("planId")}
                >
                  <option value="">Choose a plan…</option>
                  {options.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatNaira(plan.priceKobo)} ·{" "}
                      {plan.validityLabel}
                    </option>
                  ))}
                </select>
                <FieldError errors={[errors.planId]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="wifi-batch-quantity">
                  How many vouchers
                </FieldLabel>
                <Input
                  id="wifi-batch-quantity"
                  type="number"
                  min={1}
                  max={MAX_QUANTITY}
                  inputMode="numeric"
                  {...register("quantity")}
                />
                <FieldDescription>
                  One to {MAX_QUANTITY}. Each code is unique, single-use, and
                  active on the hotspot the moment it is generated.
                </FieldDescription>
                <FieldError errors={[errors.quantity]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="wifi-batch-label">Batch label</FieldLabel>
                <Input
                  id="wifi-batch-label"
                  placeholder={`Counter — ${todayLabel()}`}
                  {...register("label")}
                />
                <FieldError errors={[errors.label]} />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={mintBatch.isPending}>
                {mintBatch.isPending ? <Spinner /> : null}
                {mintBatch.isPending ? "Minting…" : "Generate & activate"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {minted ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyCodes()}
            >
              <Icon icon={Copy01Icon} />
              Copy codes
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                printVoucherSheet(minted, planName(minted.batch.planId))
              }
            >
              <Icon icon={PrinterIcon} />
              Print sheet
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
