"use client";

import type { HotspotSession } from "@/hooks/use-wifi-router";
import * as React from "react";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { useHotspotSessions, useKickSession } from "@/hooks/use-wifi-router";
import { UserIcon, WifiOffIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
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
import { formatBytes, formatNaira } from "@turbo/wifi/format";

const PAGE_SIZE = 25;

/** Dot colour per board state; `black` reads as "off" in both themes. */
const indicatorDot: Record<HotspotSession["indicator"], string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  black: "bg-muted-foreground",
};

const statusLabel = (row: HotspotSession) =>
  row.status === "connected" ? "Connected" : "Disconnected";

const KickButton = ({ row }: { row: HotspotSession }) => {
  const kick = useKickSession();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
      disabled={kick.isPending}
      onClick={() =>
        kick.mutate(row.code, {
          onSuccess: ({ kicked }) =>
            kicked > 0
              ? toast.success(`${row.code} disconnected`)
              : toast.info(`${row.code} was already offline`),
          onError: (error) => toast.error(error.message),
        })
      }
    >
      <Icon icon={WifiOffIcon} />
      Disconnect
    </Button>
  );
};

/**
 * The attendance board: everyone who has connected, live or not.
 *
 * Green is healthy, yellow is trial or under an hour left, red is connected
 * without internet (WAN down, or barely any traffic), black is disconnected.
 * A dead router degrades the whole board to black instead of erroring — the
 * rows are anchored in Postgres, the router only overlays what it knows.
 * Foreign hotspot users the console cannot trace to a voucher appear while
 * they are connected; hiding them would understate the load on the router.
 */
export const WifiSessionsTable = () => {
  const [page, setPage] = React.useState(1);
  const { data, isPending, isError, refetch } = useHotspotSessions({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  if (isError) {
    return (
      <TableCard title="Live sessions" padding="sm">
        <QueryError
          title="Could not load live sessions"
          showSignIn
          framed={false}
          onRetry={() => void refetch()}
        />
      </TableCard>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const routerDown = data?.routerReachable === false;

  return (
    <TableCard
      title="Live sessions"
      description={
        routerDown
          ? "Router unreachable — showing everyone as disconnected. The board recovers on its own."
          : "Everyone who has connected, live or not. Green healthy · yellow trial or expiring · red connected without internet · black disconnected. Updates every 15 seconds."
      }
      action={
        <div className="flex items-center gap-2">
          {routerDown ? (
            <Badge variant="warning" className="rounded-full font-normal">
              Router offline
            </Badge>
          ) : null}
          <Badge variant="secondary" className="rounded-full font-normal">
            {data?.connected ?? 0} online
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
            <TableHead>Status</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Connected</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={9}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={9} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  Nobody has connected yet.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.code}>
                <TableCell>
                  <span className="flex items-center gap-2 font-mono font-semibold tracking-wider">
                    <Icon
                      icon={UserIcon}
                      className="text-muted-foreground size-3.5"
                    />
                    {row.code}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      role="img"
                      aria-label={statusLabel(row)}
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        indicatorDot[row.indicator],
                      )}
                    />
                    <span className="whitespace-nowrap">
                      {statusLabel(row)}
                    </span>
                    {row.reason ? (
                      <span className="text-muted-foreground text-xs">
                        {row.reason}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.planName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.phone ??
                    (row.known ? (
                      "Counter sale"
                    ) : (
                      <span className="text-muted-foreground/70">
                        Not issued here
                      </span>
                    ))}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.amountKobo != null ? formatNaira(row.amountKobo) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {row.address ?? "—"}
                  {row.macAddress ? (
                    <span className="text-muted-foreground/70 block">
                      {row.macAddress}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {row.uptime ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {row.status === "connected"
                    ? formatBytes(row.sessionBytes)
                    : formatBytes(row.bytesUsed)}
                </TableCell>
                <TableCell className="text-right">
                  {row.status === "connected" ? (
                    <KickButton row={row} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
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
