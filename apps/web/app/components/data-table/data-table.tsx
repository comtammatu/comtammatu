"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
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
  render: (row: T) => ReactNode;
  hideOnMobile?: boolean;
}

/* ------------------------------------------------------------------ */
/* Filter definition                                                   */
/* ------------------------------------------------------------------ */

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableFilter {
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
  mobileCardRender: (row: T) => ReactNode;
  actions?: ReactNode;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  className?: string;
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
  className,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const colSpan = columns.filter((c) => !c.hideOnMobile).length + 1;
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
          data.map((row) => (
            <div key={getRowKey(row)}>{mobileCardRender(row)}</div>
          ))
        )}
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
            data.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
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
