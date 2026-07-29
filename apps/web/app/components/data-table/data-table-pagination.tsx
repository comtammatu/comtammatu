"use client";

import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI } from "@comtammatu/shared/messages";

interface DataTablePaginationProps {
  pageSize: number;
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
  touch?: boolean;
}

export function DataTablePagination({
  pageSize,
  currentPage,
  totalItems,
  onPageChange,
  className,
  touch = false,
}: DataTablePaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-t px-3 py-2",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        {start}–{end} / {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size={touch ? "icon-touch" : "icon-sm"}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={ACTIONS_VI.prevPage}
        >
          <IconChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">
          {currentPage}/{totalPages}
        </span>
        <Button
          variant="outline"
          size={touch ? "icon-touch" : "icon-sm"}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={ACTIONS_VI.nextPage}
        >
          <IconChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
