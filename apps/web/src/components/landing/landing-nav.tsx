"use client";

import Link from "next/link";
import { SaleslipLogo } from "@/components/saleslip-logo";
import { useSession } from "@/hooks/use-session";

import { Button } from "@turbo/ui/components/button";
import { ThemeToggle } from "@turbo/ui/components/theme";

export const LandingNav = () => {
  const { data: session, isPending } = useSession();

  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <SaleslipLogo size="sm" className="text-primary" />
          <span className="text-sm font-semibold">Saleslip</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isPending ? null : session ? (
            <Button size="sm" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/login">Admin login</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/#plans">Get online</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
