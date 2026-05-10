"use client";

import { cn } from "@comtammatu/ui";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNextButton,
  PaginationPreviousButton,
  PaginationStatus,
} from "@comtammatu/ui/components/pagination";

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
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPreviousButton
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Trang trước"
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationStatus>
              {currentPage}/{totalPages}
            </PaginationStatus>
          </PaginationItem>
          <PaginationItem>
            <PaginationNextButton
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Trang sau"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
