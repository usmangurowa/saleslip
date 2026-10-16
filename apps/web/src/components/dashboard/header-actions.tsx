"use client";

import { useSearchCommand } from "@/components/dashboard/search-context";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@turbo/ui/components/button";
import { Icon } from "@turbo/ui/components/icon";

export const HeaderActions = () => {
  const { openSearch } = useSearchCommand();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label="Search"
        onClick={openSearch}
      >
        <Icon icon={Search01Icon} />
      </Button>
    </div>
  );
};
