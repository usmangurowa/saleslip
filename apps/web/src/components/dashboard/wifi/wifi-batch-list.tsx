"use client";

import type { WifiBatch } from "@/hooks/use-wifi";
import Link from "next/link";
import { TableCard } from "@/components/dashboard/table-card";
import { useWifiBatches } from "@/hooks/use-wifi";
import { useDeleteVoucherBatch } from "@/hooks/use-wifi-router";
import { ArrowRight01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
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

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const DeleteBatchButton = ({ batch }: { batch: WifiBatch }) => {
  const deleteBatch = useDeleteVoucherBatch();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={deleteBatch.isPending}
        >
          <Icon icon={Delete02Icon} />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{batch.label}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The batch and every voucher still in it are deleted — live codes are
            removed from the router, now or automatically once it is back
            online. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteBatch.mutate(batch.id, {
                onSuccess: (body) =>
                  toast.success(
                    `${body.label} deleted — ${body.vouchers} ${body.vouchers === 1 ? "voucher" : "vouchers"} removed${body.revocationsQueued > 0 ? ` · ${body.revocationsQueued} revoking when the router is back` : ""}`,
                  ),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Delete batch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * Recent counter minting runs.
 *
 * A batch is the only record tying a physical sheet of printed codes back to a
 * decision, so it stays visible even though the codes themselves are listed
 * below it.
 */
export const WifiBatchList = () => {
  const { data, isPending } = useWifiBatches();
  const batches = data ?? [];

  return (
    <TableCard
      title="Recent batches"
      description="Counter sheets generated from this console — click any batch to view its vouchers."
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Batch</TableHead>
            <TableHead>Profile</TableHead>
            <TableHead className="text-right">Codes</TableHead>
            <TableHead>Generated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : batches.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="h-20 text-center">
                <span className="text-muted-foreground text-sm">
                  No counter sheets yet — generate one using New Batch above.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            batches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/wifi/vouchers?batchId=${batch.id}`}
                    className="hover:underline"
                  >
                    {batch.label}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {batch.profile}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {batch.quantity}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatWhen(batch.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/dashboard/wifi/vouchers?batchId=${batch.id}`}
                      >
                        View vouchers
                        <Icon icon={ArrowRight01Icon} className="size-3.5" />
                      </Link>
                    </Button>
                    <DeleteBatchButton batch={batch} />
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
};
