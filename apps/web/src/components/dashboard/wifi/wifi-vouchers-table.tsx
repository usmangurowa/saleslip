"use client";

import type { WifiVoucher } from "@/hooks/use-wifi";
import * as React from "react";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { useRevokeVoucher, useWifiVouchers } from "@/hooks/use-wifi";
import { Delete02Icon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@turbo/ui/components/alert-dialog";
import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import { Icon } from "@turbo/ui/components/icon";
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
import { cn } from "@turbo/ui/lib/utils";

const PAGE_SIZE = 25;

type VoucherStatus = WifiVoucher["status"];

const channelLabels: Record<WifiVoucher["channel"], string> = {
  web: "Web checkout",
  telegram: "Telegram",
  manual: "Counter sale",
};

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const RevokeButton = ({ voucher }: { voucher: WifiVoucher }) => {
  const revokeVoucher = useRevokeVoucher();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={revokeVoucher.isPending}
        >
          <Icon icon={Delete02Icon} />
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {voucher.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            The code stops counting as active here. If it was already added to
            Mikhmon, remove it there too — the dashboard cannot reach the
            router, so this does not disconnect anyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              revokeVoucher.mutate(voucher.id, {
                onSuccess: () => toast.success(`${voucher.code} revoked`),
                onError: () => toast.error("Could not revoke the voucher"),
              })
            }
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export interface WifiVouchersTableProps {
  /** Pin the table to one minting run, e.g. from a batch row. */
  batchId?: string;
  title?: string;
  description?: string;
}

/**
 * Issued voucher codes across every channel, with a status filter.
 *
 * Codes are the unit of support here — a customer reads one out and the
 * operator needs to find it, see where it came from, and disable it.
 */
export const WifiVouchersTable = ({
  batchId,
  title = "Vouchers",
  description = "Every code issued through the shop, Telegram, or the counter.",
}: WifiVouchersTableProps) => {
  const [status, setStatus] = React.useState<VoucherStatus | "all">("all");
  const [page, setPage] = React.useState(1);

  const { data, isPending, isError, refetch } = useWifiVouchers({
    ...(status === "all" ? {} : { status }),
    ...(batchId ? { batchId } : {}),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const revokeVoucher = useRevokeVoucher();

  if (isError) {
    return (
      <TableCard title={title} padding="sm">
        <QueryError
          title="Could not load vouchers"
          framed={false}
          onRetry={() => void refetch()}
        />
      </TableCard>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <TableCard
      title={title}
      description={description}
      action={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as VoucherStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" aria-label="Filter vouchers by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="rounded-full font-normal">
            {total}
          </Badge>
        </div>
      }
      footer={
        <TablePagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Code</TableHead>
            <TableHead>Profile</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  No vouchers here yet.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((voucher) => (
              <TableRow key={voucher.id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-mono font-semibold tracking-wider">
                    <Icon
                      icon={Ticket01Icon}
                      className="text-muted-foreground size-3.5"
                    />
                    {voucher.code}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {voucher.profile}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {channelLabels[voucher.channel]}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        voucher.status === "active"
                          ? "bg-success"
                          : "bg-muted-foreground",
                      )}
                    />
                    {voucher.status === "active" ? "Active" : "Revoked"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatWhen(voucher.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {voucher.status === "active" ? (
                    <RevokeButton voucher={voucher} />
                  ) : (
                    <span
                      className="text-muted-foreground text-xs"
                      aria-live="polite"
                    >
                      {revokeVoucher.isPending ? "Revoking…" : ""}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
};
