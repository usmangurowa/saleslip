"use client";

import type { WifiVoucher } from "@/hooks/use-wifi";
import * as React from "react";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { useWifiVouchers } from "@/hooks/use-wifi";
import {
  useBulkDeleteVoucher,
  useDeleteVoucher,
} from "@/hooks/use-wifi-router";
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
import { Checkbox } from "@turbo/ui/components/checkbox";
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
import { formatBytes } from "@turbo/wifi/format";

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

/**
 * The single destructive action. Live codes are removed from the router
 * first (fail-closed); dead codes are history-only. One button, the server
 * picks the right settlement per voucher.
 */
const DeleteButton = ({ voucher }: { voucher: WifiVoucher }) => {
  const deleteVoucher = useDeleteVoucher();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={deleteVoucher.isPending}
        >
          <Icon icon={Delete02Icon} />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {voucher.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            {voucher.status === "active"
              ? "The code is removed from the router first, then its record is deleted. This cannot be undone."
              : "The code is already dead — this only removes its record from the dashboard. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteVoucher.mutate(voucher.id, {
                onSuccess: () => toast.success(`${voucher.code} deleted`),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Delete
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
 * operator needs to find it, see where it came from, and remove it. Rows can
 * be selected for bulk deletion; each settles independently (live codes are
 * revoked from the router first, in-flight orders refuse) and the toast
 * reports exactly what happened.
 */
export const WifiVouchersTable = ({
  batchId,
  title = "Vouchers",
  description = "Every code issued through the shop, Telegram, or the counter.",
}: WifiVouchersTableProps) => {
  const [status, setStatus] = React.useState<VoucherStatus | "all">("all");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useWifiVouchers({
    ...(status === "all" ? {} : { status }),
    ...(batchId ? { batchId } : {}),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
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
  const pageIds = rows.map((voucher) => voucher.id);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedRows = rows.filter((voucher) => selected.has(voucher.id));
  const selectedLive = selectedRows.filter(
    (voucher) => voucher.status === "active",
  ).length;

  const clearSelection = () => setSelected(new Set());
  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

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
              clearSelection();
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
          {selected.size > 0 ? (
            <BulkDeleteBar
              count={selected.size}
              live={selectedLive}
              onDone={clearSelection}
              ids={[...selected]}
            />
          ) : null}
        </div>
      }
      footer={
        <TablePagination
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => {
            setPage(next);
            clearSelection();
          }}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all vouchers on this page"
                checked={allOnPageSelected}
                onCheckedChange={togglePage}
                disabled={rows.length === 0}
              />
            </TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Profile</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={8}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  No vouchers here yet.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((voucher) => (
              <TableRow key={voucher.id}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${voucher.code}`}
                    checked={selected.has(voucher.id)}
                    onCheckedChange={() => toggleRow(voucher.id)}
                  />
                </TableCell>
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
                <TableCell>
                  {voucher.activatedAt ? (
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatBytes(voucher.bytesUsed)}
                    </span>
                  ) : voucher.lastError ? (
                    <Badge variant="destructive" className="font-normal">
                      Not live
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatWhen(voucher.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <DeleteButton voucher={voucher} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
};

/** Appears in the card action row once rows are selected. */
const BulkDeleteBar = ({
  ids,
  count,
  live,
  onDone,
}: {
  ids: string[];
  count: number;
  live: number;
  onDone: () => void;
}) => {
  const bulkDelete = useBulkDeleteVoucher();

  const summaryToast = (summary: {
    deleted: number;
    blocked: number;
    skippedRouter: number;
    notFound: number;
  }) => {
    const parts = [
      `${summary.deleted} deleted`,
      summary.blocked > 0 ? `${summary.blocked} awaiting fulfilment` : null,
      summary.skippedRouter > 0 ? `${summary.skippedRouter} skipped` : null,
      summary.notFound > 0 ? `${summary.notFound} not found` : null,
    ].filter((part): part is string => part !== null);
    toast.success(parts.join(" · "));
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={bulkDelete.isPending}>
          <Icon icon={Delete02Icon} />
          Delete {count} selected
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {count} vouchers?</AlertDialogTitle>
          <AlertDialogDescription>
            {live > 0
              ? `${live} live ${live === 1 ? "code is" : "codes are"} removed from the router first, then every record is deleted. Codes still awaiting fulfilment are skipped. This cannot be undone.`
              : "Every selected code is already dead — their records are deleted. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep them</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              bulkDelete.mutate(ids, {
                onSuccess: (body) => {
                  summaryToast(body.summary);
                  onDone();
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Delete {count}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
