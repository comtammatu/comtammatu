"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";

interface DataTablePaginationProps {
  pageSize: number;
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function DataTablePagination({
  pageSize,
  currentPage,
  totalItems,
  onPageChange,
  className,
}: DataTablePaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-t px-2 py-3",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        {start}–{end} / {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Trang trước"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-sm font-medium tabular-nums">
          {currentPage}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Trang sau"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
