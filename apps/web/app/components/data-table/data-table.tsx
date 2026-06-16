"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { AppEmptyState } from "../surface";
import { TableEmptyStateRow } from "../table-empty-state-row";
import { DataTablePagination } from "./data-table-pagination";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Column definition                                                   */
/* ------------------------------------------------------------------ */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  className?: string;
  /**
   * `index` enables inline-edit document tables (patchLine-style row
   * mutations keyed by position). Render-only consumers ignore it.
   */
  render: (row: T, index: number) => ReactNode;
  hideOnMobile?: boolean;
}

/* ------------------------------------------------------------------ */
/* Filter definition                                                   */
/* ------------------------------------------------------------------ */

interface DataTableFilterOption {
  value: string;
  label: string;
}

interface DataTableFilter {
  key: string;
  placeholder: string;
  options: DataTableFilterOption[];
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string | number;
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  emptyMode?: "no-data" | "no-results";
  totalCount?: number;
  mobileCardRender: (row: T, index: number) => ReactNode;
  actions?: ReactNode;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string | undefined;
  className?: string;
  /**
   * Document-table totals (e.g. PO/transfer/issue line sheets). Rendered
   * as `<TableFooter>` rows on desktop and as a block under the card
   * list on mobile — pass `<TableRow>`s for desktop via this prop and a
   * mobile-friendly block via `mobileFooter`.
   */
  desktopFooter?: ReactNode;
  mobileFooter?: ReactNode;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyMode,
  totalCount,
  mobileCardRender,
  pageSize,
  currentPage,
  onPageChange,
  onRowClick,
  rowClassName,
  className,
  desktopFooter,
  mobileFooter,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const colSpan = columns.length;
  const total = totalCount ?? data.length;
  const showPagination = pageSize != null && total > pageSize;

  if (isMobile) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {data.length === 0 ? (
          <AppEmptyState
            compact
            title={emptyTitle}
            mode={emptyMode ?? "no-data"}
            description={emptyDescription}
            icon={emptyIcon}
          />
        ) : (
          data.map((row, index) => (
            <div key={getRowKey(row)}>{mobileCardRender(row, index)}</div>
          ))
        )}
        {data.length > 0 ? mobileFooter : null}
        {showPagination && (
          <DataTablePagination
            pageSize={pageSize}
            currentPage={currentPage ?? 1}
            totalItems={total}
            onPageChange={onPageChange ?? (() => {})}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableEmptyStateRow
              colSpan={colSpan}
              title={emptyTitle}
              description={emptyDescription}
              icon={emptyIcon}
              mode={emptyMode}
            />
          ) : (
            data.map((row, index) => (
              <TableRow
                key={getRowKey(row)}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-muted/45",
                  rowClassName?.(row, index),
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row, index)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {desktopFooter != null && data.length > 0 ? (
          <TableFooter>{desktopFooter}</TableFooter>
        ) : null}
      </Table>
      {showPagination && (
        <DataTablePagination
          pageSize={pageSize}
          currentPage={currentPage ?? 1}
          totalItems={total}
          onPageChange={onPageChange ?? (() => {})}
        />
      )}
    </div>
  );
}
