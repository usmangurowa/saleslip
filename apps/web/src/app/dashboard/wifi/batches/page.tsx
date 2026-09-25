import type { Metadata } from "next";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiBatchDialog } from "@/components/dashboard/wifi/wifi-batch-dialog";
import { WifiBatchList } from "@/components/dashboard/wifi/wifi-batch-list";

export const metadata: Metadata = {
  title: "WiFi voucher batches",
  description: "Voucher minting runs, newest first.",
};

/**
 * WiFi console — the batch view.
 *
 * A batch is what gets printed and handed over the counter, so this page is
 * the traceability surface: generate a new run here and find older sheets
 * below.
 */
export default function WifiBatchesPage() {
  return (
    <>
      <PageToolbar>
        <WifiBatchDialog />
      </PageToolbar>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <WifiBatchList />
      </div>
    </>
  );
}
