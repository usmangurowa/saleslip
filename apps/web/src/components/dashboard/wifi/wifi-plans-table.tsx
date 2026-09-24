"use client";

import * as React from "react";
import { useHotspotProfiles } from "@/hooks/use-wifi-router";
import {
  useCreateWifiPlan,
  useUpdateWifiPlan,
  useWifiPlans,
  type WifiPlanOption,
} from "@/hooks/use-wifi";
import { PencilEdit01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@turbo/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@turbo/ui/components/field";
import { Icon } from "@turbo/ui/components/icon";
import { Input } from "@turbo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@turbo/ui/components/select";
import { Skeleton } from "@turbo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@turbo/ui/components/table";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";

const formatNaira = (kobo: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);

/** Derive the URL-stable slug from a plan name: "1 Day Unlimited" → "1-day-unlimited". */
const toSlug = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "plan";

const VALIDITY_UNITS = {
  d: "day",
  h: "hour",
  m: "minute",
  s: "second",
} as const;

/**
 * Read router shorthand back in plain language: "7d" → "7 days",
 * "1d12h" → "1 day and 12 hours". Returns null when the label isn't
 * shorthand, so the caller can fall back to the static hint.
 */
const describeValidity = (label: string): string | null => {
  const trimmed = label.trim().toLowerCase();
  if (trimmed === "" || !/^(?:\d+[dhms])+$/.test(trimmed)) return null;
  const parts: string[] = [];
  for (const match of trimmed.matchAll(/(\d+)([dhms])/g)) {
    const digits = match[1];
    const unitLetter = match[2];
    if (!digits || !unitLetter) return null;
    const amount = Number(digits);
    const unit = VALIDITY_UNITS[unitLetter as keyof typeof VALIDITY_UNITS];
    parts.push(`${amount} ${unit}${amount === 1 ? "" : "s"}`);
  }
  if (parts.length === 1) return parts[0] ?? null;
  const last = parts.at(-1);
  return last ? `${parts.slice(0, -1).join(", ")} and ${last}` : null;
};

interface PlanForm {
  id: string;
  name: string;
  description: string;
  priceNaira: string;
  profile: string;
  validityLabel: string;
  sortOrder: string;
}

const toForm = (plan?: WifiPlanOption): PlanForm => ({
  id: plan?.id ?? "",
  name: plan?.name ?? "",
  description: plan?.description ?? "",
  priceNaira: plan ? (plan.priceKobo / 100).toString() : "",
  profile: plan?.profile ?? "",
  validityLabel: plan?.validityLabel ?? "",
  sortOrder: plan?.sortOrder?.toString() ?? "0",
});

const PlanDialog = ({
  plan,
  profiles,
  open,
  onOpenChange,
}: {
  plan?: WifiPlanOption;
  profiles: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const isEdit = plan !== undefined;
  const [form, setForm] = React.useState<PlanForm>(() => toForm(plan));
  const validitySummary = describeValidity(form.validityLabel);
  const createPlan = useCreateWifiPlan();
  const updatePlan = useUpdateWifiPlan();
  const pending = isEdit ? updatePlan : createPlan;

  React.useEffect(() => {
    if (open) setForm(toForm(plan));
  }, [open, plan]);

  const set =
    (key: keyof PlanForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((current) => {
        // On create the slug follows the name until the user edits it by hand.
        // While the ID still matches the auto-generated slug (or is untouched),
      // keep it in sync so users never hand-edit it.
      if (
        key === "name" &&
        !isEdit &&
        (current.id === "" || current.id === toSlug(current.name))
      ) {
          return { ...current, name: value, id: toSlug(value) };
        }
        return { ...current, [key]: value };
      });
    };

  const submit = () => {
    const priceKobo = Math.round(Number(form.priceNaira) * 100);
    const onError = (error: Error) => toast.error(error.message);
    const onSuccess = () => {
      onOpenChange(false);
      // Buy page reads the same table — no redeploy needed.
      toast.success(
        isEdit ? "Plan updated" : "Plan created — live on the buy page",
      );
    };
    if (isEdit) {
      updatePlan.mutate(
        {
          id: plan.id,
          name: form.name.trim(),
          description: form.description.trim(),
          priceKobo,
          profile: form.profile.trim(),
          validityLabel: form.validityLabel.trim(),
          sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
        },
        { onSuccess, onError },
      );
    } else {
      createPlan.mutate(
        {
          id: toSlug(form.id || form.name),
          name: form.name.trim(),
          description: form.description.trim() || form.name.trim(),
          priceKobo,
          profile: form.profile.trim(),
          validityLabel: form.validityLabel.trim(),
          sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
        },
        { onSuccess, onError },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            What the buy page sells — price, validity, and the router profile
            vouchers mint against.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="plan-name">Name</FieldLabel>
            <Input
              id="plan-name"
              value={form.name}
              onChange={set("name")}
              placeholder="1 Day Unlimited"
              disabled={pending.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-id">Plan ID</FieldLabel>
            <Input
              id="plan-id"
              value={form.id}
              onChange={set("id")}
              placeholder="1-day-unlimited"
              disabled={pending.isPending || isEdit}
            />
            <FieldDescription>
              Auto-filled from the name (e.g. "1 Day Unlimited" →
              "1-day-unlimited"); stable identifier used in checkout links.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-description">Description</FieldLabel>
            <Input
              id="plan-description"
              value={form.description}
              onChange={set("description")}
              placeholder="Unlimited data for 24 hours"
              disabled={pending.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-price">Price (₦)</FieldLabel>
            <Input
              id="plan-price"
              type="number"
              min={0}
              value={form.priceNaira}
              onChange={set("priceNaira")}
              placeholder="1000"
              disabled={pending.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-profile">Router profile</FieldLabel>
            <Select
              value={form.profile}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, profile: value }))
              }
              disabled={pending.isPending}
            >
              <SelectTrigger
                id="plan-profile"
                className="w-full"
                aria-label="Router profile"
              >
                <SelectValue placeholder="Pick a hotspot profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {profile}
                  </SelectItem>
                ))}
                {form.profile !== "" && !profiles.includes(form.profile) ? (
                  <SelectItem value={form.profile}>
                    {form.profile} (missing on router)
                  </SelectItem>
                ) : null}
                {profiles.length === 0 && form.profile === "" ? (
                  <SelectItem value="none" disabled>
                    No hotspot profiles found on the router
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <FieldDescription>
              Must match a hotspot profile on the router exactly — vouchers
              mint against it.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-validity">Validity label</FieldLabel>
            <Input
              id="plan-validity"
              value={form.validityLabel}
              onChange={set("validityLabel")}
              placeholder="24h"
              disabled={pending.isPending}
            />
            <FieldDescription>
              Shorthand works — 12h = 12 hours, 10m = 10 minutes, 7d = 7 days.
            </FieldDescription>
            {validitySummary ? (
              <FieldDescription className="text-foreground">
                You are setting the validity of this plan to{" "}
                {validitySummary}.
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-sort">Sort order</FieldLabel>
            <Input
              id="plan-sort"
              type="number"
              min={0}
              max={9999}
              value={form.sortOrder}
              onChange={set("sortOrder")}
              disabled={pending.isPending}
            />
            <FieldDescription>
              Lower numbers appear first on the buy page.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending.isPending}>
            {isEdit ? "Save changes" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The purchasable plan catalogue. Lives in the database, so plans created
 * here show up on the buy page immediately — no deploy, no env change.
 */
export const WifiPlansTable = () => {
  const { data, isPending, isError, error, refetch } = useWifiPlans(true);
  const { data: profileData } = useHotspotProfiles();
  const [editing, setEditing] = React.useState<WifiPlanOption | undefined>();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const updatePlan = useUpdateWifiPlan();

  if (isError) {
    return (
      <TableCard title="Plans" padding="sm">
        <QueryError
          title="Could not load plans"
          showSignIn
          framed={false}
          onRetry={() => void refetch()}
        />
      </TableCard>
    );
  }

  const plans = data ?? [];
  const profiles = profileData?.profiles?.map((profile) => profile.name) ?? [];

  const toggleActive = (plan: WifiPlanOption) =>
    updatePlan.mutate(
      { id: plan.id, active: !plan.active },
      {
        onSuccess: () =>
          toast.success(plan.active ? "Plan hidden" : "Plan published"),
        onError: (mutationError) => toast.error(mutationError.message),
      },
    );

  return (
    <TableCard
      title="Plans"
      description="The buy page reads this catalogue — new plans are live immediately."
      action={
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          <Icon icon={PlusSignIcon} />
          New plan
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Plan</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Router profile</TableHead>
            <TableHead>Validity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            Array.from({ length: 3 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : plans.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  No plans yet — add one to put it on the buy page.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="font-medium">{plan.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {plan.id}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatNaira(plan.priceKobo)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {plan.profile}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {plan.validityLabel}
                </TableCell>
                <TableCell>
                  {plan.active ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge variant="secondary">Hidden</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(plan);
                        setDialogOpen(true);
                      }}
                    >
                      <Icon icon={PencilEdit01Icon} />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={updatePlan.isPending}
                      onClick={() => toggleActive(plan)}
                    >
                      {plan.active ? "Hide" : "Publish"}
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <PlanDialog
        plan={editing}
        profiles={profiles}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </TableCard>
  );
};
