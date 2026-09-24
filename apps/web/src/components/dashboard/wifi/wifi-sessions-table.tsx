"use client";

import type { HotspotSession } from "@/hooks/use-wifi-router";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";
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
import { formatBytes, formatNaira } from "@turbo/wifi/format";

const KickButton = ({ session }: { session: HotspotSession }) => {
  const kick = useKickSession();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
      disabled={kick.isPending}
      onClick={() =>
        kick.mutate(session.user, {
          onSuccess: ({ kicked }) =>
            kicked > 0
              ? toast.success(`${session.user} disconnected`)
              : toast.info(`${session.user} was already offline`),
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
 * Who is on the hotspot right now, straight from the router.
 *
 * Refreshed on an interval rather than cached: a row is only interesting while
 * the client is still connected. Sessions the console cannot trace back to a
 * voucher are shown too — they are someone else's hotspot users, and hiding
 * them would make the list quietly lie about the load on the router.
 */
export const WifiSessionsTable = () => {
  const { data, isPending, isError, error, refetch } = useHotspotSessions();

  if (isError) {
    const routerDown = (error as Error & { status?: number }).status === 503;

    return (
      <TableCard title="Live sessions" padding="sm">
        <QueryError
          title="Could not load live sessions"
          description={
            routerDown
              ? "The hotspot is offline. Sessions appear once it is reachable."
              : undefined
          }
          showSignIn={!routerDown}
          framed={false}
          onRetry={() => void refetch()}
        />
      </TableCard>
    );
  }

  const sessions = data?.sessions ?? [];

  return (
    <TableCard
      title="Live sessions"
      description="Clients connected to the hotspot right now. Updates every 15 seconds."
      action={
        <Badge variant="secondary" className="rounded-full font-normal">
          {data?.live ?? 0} online
        </Badge>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Code</TableHead>
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
            Array.from({ length: 3 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={8}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : sessions.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  Nobody is connected right now.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-mono font-semibold tracking-wider">
                    <Icon
                      icon={UserIcon}
                      className="text-muted-foreground size-3.5"
                    />
                    {session.user}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {session.planName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {session.phone ??
                    (session.known ? (
                      "Counter sale"
                    ) : (
                      <span className="text-muted-foreground/70">
                        Not issued here
                      </span>
                    ))}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {session.amountKobo != null
                    ? formatNaira(session.amountKobo)
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {session.address ?? "—"}
                  {session.macAddress ? (
                    <span className="text-muted-foreground/70 block">
                      {session.macAddress}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {session.uptime ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatBytes(session.bytesIn + session.bytesOut)}
                </TableCell>
                <TableCell className="text-right">
                  <KickButton session={session} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
};
