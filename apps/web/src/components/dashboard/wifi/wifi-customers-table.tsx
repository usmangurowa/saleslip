"use client";

import type { WifiCustomer } from "@/hooks/use-wifi";
import * as React from "react";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { useWifiCustomers, useWifiPlans } from "@/hooks/use-wifi";
import { UserMultipleIcon } from "@hugeicons/core-free-icons";

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
import { formatNaira } from "@turbo/wifi/format";

const PAGE_SIZE = 25;

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const HeaderLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground flex items-center gap-1.5">
    <Icon icon={UserMultipleIcon} className="size-3.5" strokeWidth={1.5} />
    {children}
  </span>
);

const CustomerCell = ({ customer }: { customer: WifiCustomer }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-foreground font-medium tabular-nums">
      {customer.phone}
    </span>
    {customer.email ? (
      <span className="text-muted-foreground text-xs">{customer.email}</span>
    ) : null}
  </div>
);

/**
 * Buying customers, one row per phone number with lifetime totals.
 *
 * This is the relationship view: it answers "who is buying from us again",
 * so spend and visit counts stay together rather than living only on
 * individual orders.
 */
export const WifiCustomersTable = () => {
  const [page, setPage] = React.useState(1);
  const { data, isPending, isError, refetch, isRefetching } = useWifiCustomers({
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
      <TableCard title="Customers" padding="sm">
        <QueryError
          title="Could not load customers"
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
      title="Customers"
      description="Everyone who has bought access, rolled up by phone number with lifetime totals."
      action={
        <Badge variant="secondary" className="rounded-full font-normal">
          {total} {total === 1 ? "customer" : "customers"}
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
            <TableHead className="text-right">
              <HeaderLabel>Orders</HeaderLabel>
            </TableHead>
            <TableHead className="text-right">
              <HeaderLabel>Total paid</HeaderLabel>
            </TableHead>
            <TableHead>
              <HeaderLabel>Latest plan</HeaderLabel>
            </TableHead>
            <TableHead>
              <HeaderLabel>Last order</HeaderLabel>
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
                  No customers yet — orders appear here once someone buys.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((customer) => (
              <TableRow key={customer.phone}>
                <TableCell>
                  <CustomerCell customer={customer} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {customer.orders}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({customer.paidOrders} paid)
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatNaira(customer.totalPaidKobo)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {customer.latestPlanId
                    ? (planNames.get(customer.latestPlanId) ??
                      customer.latestPlanId)
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatWhen(customer.lastOrderAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
};
