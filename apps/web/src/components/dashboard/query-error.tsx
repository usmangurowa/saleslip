"use client";

import Link from "next/link";

import { Button } from "@turbo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@turbo/ui/components/empty";
import { cn } from "@turbo/ui/lib/utils";

/**
 * Error state for dashboard queries — the sign-in link covers expired sessions.
 *
 * Pass `description` and `showSignIn={false}` when the failure is
 * infrastructure (e.g. the hotspot is unreachable) so the state does not
 * wrongly suggest an auth problem.
 */
export const QueryError = ({
  title,
  description,
  showSignIn = true,
  onRetry,
  framed = true,
  className,
}: {
  title: string;
  /** Overrides the default "check your connection" copy. */
  description?: string;
  /** Hide the sign-in link when the failure is not auth-related. */
  showSignIn?: boolean;
  onRetry: () => void;
  /** Dashed frame around the state. Turn off when the parent card already has one. */
  framed?: boolean;
  /** Extra classes for the state, e.g. a top divider inside a card. */
  className?: string;
}) => (
  <Empty
    data-slot="query-error"
    className={cn(
      "flex-1",
      framed && "rounded-2xl border border-dashed",
      className,
    )}
  >
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>
        {description ??
          "Check your connection, or sign in again if your session expired."}
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
        {showSignIn ? (
          <Button size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        ) : null}
      </div>
    </EmptyContent>
  </Empty>
);
