"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@turbo/ui/components/toggle-group";

export const REVENUE_RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "7d" },
  { value: "month", label: "30d" },
  { value: "all", label: "All" },
] as const;

export type RevenueRange = (typeof REVENUE_RANGES)[number]["value"];

interface RevenueRangeToggleProps {
  value: RevenueRange;
  onValueChange: (value: RevenueRange) => void;
}

/**
 * Shared range selector for revenue stats. Used in the overview toolbar and
 * the WiFi orders page toolbar so the operator can switch between today,
 * 7-day, 30-day and all-time views without the control cluttering a card.
 */
export const RevenueRangeToggle = ({
  value,
  onValueChange,
}: RevenueRangeToggleProps) => (
  <ToggleGroup
    type="single"
    size="sm"
    variant="outline"
    spacing={0}
    value={value}
    onValueChange={(next) => next && onValueChange(next as RevenueRange)}
    aria-label="Revenue range"
    className="h-7 text-xs"
  >
    {REVENUE_RANGES.map((option) => (
      <ToggleGroupItem key={option.value} value={option.value}>
        {option.label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);
