import Link from "next/link";
import { OverviewStatRow } from "@/components/dashboard/overview-stat-row";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { WifiBatchDialog } from "@/components/dashboard/wifi/wifi-batch-dialog";
import { WifiSessionsTable } from "@/components/dashboard/wifi/wifi-sessions-table";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@turbo/ui/components/button";
import { Icon } from "@turbo/ui/components/icon";

export const OverviewView = () => (
  <>
    <PageToolbar>
      <WifiBatchDialog />
      <div className="flex items-center gap-3">
        <p className="text-muted-foreground hidden text-sm lg:block">
          Live pulse of the hotspot business — vouchers, payments, and who is
          online right now.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/wifi">
            Open WiFi console
            <Icon
              icon={ArrowRight01Icon}
              className="size-4"
              strokeWidth={1.5}
            />
          </Link>
        </Button>
      </div>
    </PageToolbar>
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <OverviewStatRow />
      <WifiSessionsTable />
    </div>
  </>
);
