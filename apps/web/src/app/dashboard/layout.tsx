import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/auth/server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { HeaderActions } from "@/components/dashboard/header-actions";
import { PageTitle } from "@/components/dashboard/page-title";
import { SearchProvider } from "@/components/dashboard/search-context";
import { env } from "@/env";

import { resolveAllowlist } from "@turbo/shared";
import { Separator } from "@turbo/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@turbo/ui/components/sidebar";
import { ThemeToggle } from "@turbo/ui/components/theme";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your workspace overview",
};

// The dashboard is auth-gated: `getSession()` reads cookies on every request,
// so no route under it can be prerendered. Opt the whole subtree out of Next
// 16's instant-prerender experiment, which would otherwise try to prerender a
// blocking shell around the runtime cookie access.
export const instant = false;

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const email = session?.user.email.toLowerCase();
  const isAdmin = !!email && resolveAllowlist(env.ADMIN_EMAILS).includes(email);

  if (!session) redirect("/login");
  if (!isAdmin) redirect("/");

  return (
    <SidebarProvider>
      <SearchProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="bg-background/80 sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b backdrop-blur-sm transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
            <div className="flex w-full items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="my-auto mr-2 data-[orientation=vertical]:h-4"
              />
              <PageTitle />
              <div className="ml-auto flex items-center gap-2">
                <HeaderActions />
                <ThemeToggle />
              </div>
            </div>
          </header>
          {children}
        </SidebarInset>
      </SearchProvider>
    </SidebarProvider>
  );
}
