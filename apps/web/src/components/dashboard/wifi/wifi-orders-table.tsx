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
  const { data, isPending, isError, refetch, isRefetching } = useWifiOrders({
    status: statuses,
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
        <Badge variant="secondary" className="rounded-full font-normal">
          {total} {total === 1 ? "order" : "orders"}
        </Badge>
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
            <TableHead>
              <HeaderLabel>Customer</HeaderLabel>
            </TableHead>
            <TableHead>
              <HeaderLabel>Plan</HeaderLabel>
            </TableHead>
            <TableHead>
              <HeaderLabel>Status</HeaderLabel>
            </TableHead>
            <TableHead className="text-right">
              <HeaderLabel>Amount</HeaderLabel>
            </TableHead>
            <TableHead>
              <HeaderLabel>Placed</HeaderLabel>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending || isRefetching ? (
            Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  No orders match this filter yet.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium tabular-nums">
                      {order.phone}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {order.channel === "telegram" ? "Telegram" : "Web"}
                      {order.email ? ` · ${order.email}` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {planNames.get(order.planId) ?? order.planId}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusCell status={order.status} />
                    {order.lastError ? (
                      <span
                        className="text-destructive max-w-56 truncate text-xs"
                        title={order.lastError}
                      >
                        {order.lastError}
                      </span>
                    ) : order.status === "pending_router" &&
                      order.routerAttempts > 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {order.routerAttempts}{" "}
                        {order.routerAttempts === 1 ? "attempt" : "attempts"}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNaira(order.amountKobo)}
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
