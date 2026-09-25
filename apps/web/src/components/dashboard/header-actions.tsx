"use client";

import { useSearchCommand } from "@/components/dashboard/search-context";
import {
  Csv01Icon,
  FileExportIcon,
  Pdf01Icon,
  Search01Icon,
  Upload03Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button } from "@turbo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@turbo/ui/components/dropdown-menu";
import { Icon } from "@turbo/ui/components/icon";

export const HeaderActions = () => {
  const { openSearch } = useSearchCommand();

  const exportAs = (format: string) => {
    toast.success(`Export started`, {
      description: `Your ${format} file will be ready shortly.`,
    });
  };

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="rounded-full">
            <Icon icon={Upload03Icon} />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>Export data</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => exportAs("CSV")}>
            <Icon icon={Csv01Icon} />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportAs("PDF")}>
            <Icon icon={Pdf01Icon} />
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => exportAs("full backup")}>
            <Icon icon={FileExportIcon} />
            Export everything
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
