import type { Metadata } from "next";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiBatchDialog } from "@/components/dashboard/wifi/wifi-batch-dialog";
import { WifiVouchersTable } from "@/components/dashboard/wifi/wifi-vouchers-table";

export const metadata: Metadata = {
  title: "WiFi vouchers",
  description: "Every voucher code issued for the Saleslip hotspot.",
};

/**
 * WiFi console — the code view.
 *
 * Codes are what customers quote at the counter, so this is the lookup and
 * revoke surface. Batches live on their own page to keep printed sheets
 * traceable.
 */
export default async function WifiVouchersPage({
  searchParams,
}: {
  searchParams?: Promise<{ batchId?: string }>;
}) {
  const { batchId } = (await searchParams) ?? {};

  return (
    <>
      <PageToolbar>
        <WifiBatchDialog />
      </PageToolbar>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <WifiVouchersTable batchId={batchId} />
      </div>
    </>
  );
}
