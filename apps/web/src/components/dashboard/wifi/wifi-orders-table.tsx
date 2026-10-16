"use client";

import type { WifiOrder } from "@/hooks/use-wifi";
import * as React from "react";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { useWifiOrders, useWifiPlans } from "@/hooks/use-wifi";
import { UserIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@turbo/ui/components/badge";
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
import { formatNaira } from "@turbo/wifi/format";

const PAGE_SIZE = 25;

type OrderStatus = WifiOrder["status"];

const statusConfig: Record<
  OrderStatus,
  {
    label: string;
    dot: string;
    variant: "secondary" | "outline" | "destructive";
  }
> = {
  pending: {
    label: "Awaiting payment",
    dot: "bg-muted-foreground",
    variant: "outline",
  },
  paid: { label: "Paid", dot: "bg-primary", variant: "secondary" },
  fulfilled: { label: "Fulfilled", dot: "bg-success", variant: "secondary" },
  pending_router: {
    label: "Awaiting router",
    dot: "bg-warning",
    variant: "secondary",
  },
  failed: {
    label: "Failed",
    dot: "bg-destructive",
    variant: "destructive",
  },
};

const StatusCell = ({ status }: { status: OrderStatus }) => {
  const config = statusConfig[status];
  return (
    <span className="flex items-center gap-2 text-sm whitespace-nowrap">
      <span className={cn("size-2 shrink-0 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
};

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const HeaderLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground flex items-center gap-1.5">
    <Icon icon={UserIcon} className="size-3.5" strokeWidth={1.5} />
    {children}
  </span>
);

export interface WifiOrdersTableProps {
  statuses?: OrderStatus[];
}

/**
 * Paid and pending hotspot orders, newest first.
 *
 * This is the reconciliation view: it answers "did the customer get what they
 * paid for", so the fulfilment columns (attempts, last error) stay visible
 * rather than hiding behind a detail page.
 */
export const WifiOrdersTable = ({ statuses = [] }: WifiOrdersTableProps) => {
  const [page, setPage] = React.useState(1);
  const [selectedStatus, setSelectedStatus] = React.useState<OrderStatus | "all">("all");

  const effectiveStatuses = React.useMemo(() => {
    if (selectedStatus !== "all") return [selectedStatus];
    return statuses;
  }, [selectedStatus, statuses]);

  const { data, isPending, isError, refetch } = useWifiOrders({
    status: effectiveStatuses.length > 0 ? effectiveStatuses : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const { data: plans } = useWifiPlans();

  const planNames = React.useMemo(
    () => new Map((plans ?? []).map((plan) => [plan.id, plan.name])),
    [plans],
  );

  if (isError) {
    return (
      <TableCard title="Hotspot orders" padding="sm">
        <QueryError
          title="Could not load orders"
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
      title="Hotspot orders"
      description="Every purchase, newest first — filter by state to find stuck fulfilments."
      action={
        <div className="flex items-center gap-2">
          <Select
            value={selectedStatus}
            onValueChange={(val) => {
              setSelectedStatus(val as OrderStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-38 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Awaiting payment</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
              <SelectItem value="pending_router">Awaiting router</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="rounded-full font-normal">
            {total} {total === 1 ? "order" : "orders"}
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
            <TableHead>Buyer</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
            <TableHead>Last error</TableHead>
            <TableHead>Placed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="h-20 text-center">
                <span className="text-muted-foreground text-sm">
                  No orders found.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-xs">
                  {order.phone ??
                    order.email ??
                    (order.telegramId ? (
                      <HeaderLabel>Telegram {order.telegramId}</HeaderLabel>
                    ) : (
                      <span className="text-muted-foreground">Anonymous</span>
                    ))}
                </TableCell>
                <TableCell>
                  {planNames.get(order.planId) ?? (
                    <span className="text-muted-foreground font-mono text-xs">
                      {order.planId}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">
                  {formatNaira(order.amountKobo)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal capitalize">
                    {order.channel}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusCell status={order.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {order.routerAttempts}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                  {order.lastError ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatWhen(order.createdAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
};
