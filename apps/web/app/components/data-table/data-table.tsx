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
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@comtammatu/ui/components/context-menu";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { Search as IconSearch } from "lucide-react";
import { FORM_VI } from "@comtammatu/shared/messages";
import { AppEmptyState, AppToolbar } from "../surface";
import { TableEmptyStateRow } from "../table-empty-state-row";
import { DataTablePagination } from "./data-table-pagination";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Column definition                                                   */
/* ------------------------------------------------------------------ */

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  className?: string;
  /**
   * `index` enables inline-edit document tables (patchLine-style row
   * mutations keyed by position). Render-only consumers ignore it.
   */
  render: (row: T, index: number) => ReactNode;
}

export interface DataTableFooterCell {
  key: string;
  content: ReactNode;
  className?: string;
  colSpan?: number;
}

export interface DataTableFooterRow {
  key: string;
  className?: string;
  cells: DataTableFooterCell[];
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
  mobileCardRender?: (row: T, index: number) => ReactNode;
  actions?: ReactNode;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  renderRowContextMenu?: (row: T, index: number) => ReactNode;
  getRowAriaLabel?: (row: T, index: number) => string | undefined;
  getRowDataState?: (row: T, index: number) => string | undefined;
  rowClassName?: (row: T, index: number) => string | undefined;
  className?: string;
  mobileBreakpoint?: number;
  /**
   * Document-table totals (e.g. PO/transfer/issue line sheets). Rendered
   * as `<TableFooter>` rows on desktop and as a block under the card
   * list on mobile. Prefer `desktopFooterRows` so route code does not import
   * raw Table primitives; `desktopFooter` is kept for existing call sites.
   */
  desktopFooter?: ReactNode;
  desktopFooterRows?: DataTableFooterRow[];
  mobileFooter?: ReactNode;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  searchable,
  searchPlaceholder,
  filters,
  filterValues,
  onFilterChange,
  searchValue,
  onSearchChange,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyMode,
  totalCount,
  mobileCardRender,
  actions,
  pageSize,
  currentPage,
  onPageChange,
  onRowClick,
  renderRowContextMenu,
  getRowAriaLabel,
  getRowDataState,
  rowClassName,
  className,
  mobileBreakpoint,
  desktopFooter,
  desktopFooterRows,
  mobileFooter,
}: DataTableProps<T>) {
  const isMobile = useIsMobile(mobileBreakpoint) && mobileCardRender != null;
  const [openContextRowKey, setOpenContextRowKey] = React.useState<
    string | number | null
  >(null);
  const [internalPage, setInternalPage] = React.useState(1);
  const colSpan = columns.length;
  const total = totalCount ?? data.length;
  const showPagination = pageSize != null && total > pageSize;
  // `totalCount` signals server-side paging: `data` is already one page, so the
  // adapter must not slice it. Without it, the adapter owns page state and
  // slicing; the page derives clamped so a shrinking filter result never
  // strands the view on an empty page.
  const totalPages =
    pageSize != null ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const activePage = Math.min(currentPage ?? internalPage, totalPages);
  const handlePageChange = onPageChange ?? setInternalPage;
  const sliced = pageSize != null && totalCount == null;
  const pageOffset = sliced ? (activePage - 1) * (pageSize ?? 0) : 0;
  const pagedData = sliced
    ? data.slice(pageOffset, pageOffset + (pageSize ?? 0))
    : data;
  const hasToolbar =
    searchable === true ||
    (filters != null && filters.length > 0) ||
    actions != null;

  function handleRowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    row: T,
  ) {
    if (!onRowClick) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onRowClick(row);
  }

  const toolbar = hasToolbar ? (
    <AppToolbar
      variant="inline"
      search={
        searchable === true ? (
          <div className="relative min-w-0 flex-1 sm:min-w-64">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue ?? ""}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
        ) : null
      }
      filters={
        filters != null && filters.length > 0
          ? filters.map((filter) => (
              <Select
                key={filter.key}
                value={filterValues?.[filter.key] ?? ""}
                onValueChange={(value) => onFilterChange?.(filter.key, value)}
              >
                <SelectTrigger className="min-w-36">
                  <SelectValue placeholder={filter.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))
          : null
      }
      actions={actions}
    />
  ) : null;

  if (isMobile && mobileCardRender) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {toolbar}
        {data.length === 0 ? (
          <AppEmptyState
            compact
            title={emptyTitle}
            mode={emptyMode ?? "no-data"}
            description={emptyDescription}
            icon={emptyIcon}
          />
        ) : (
          pagedData.map((row, index) => (
            <div key={getRowKey(row)}>
              {mobileCardRender(row, index + pageOffset)}
            </div>
          ))
        )}
        {data.length > 0 ? mobileFooter : null}
        {showPagination && (
          <DataTablePagination
            pageSize={pageSize}
            currentPage={activePage}
            totalItems={total}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header === "" ? (
                  <span className="sr-only">{FORM_VI.action}</span>
                ) : (
                  col.header
                )}
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
            pagedData.map((row, sliceIndex) => {
              const index = sliceIndex + pageOffset;
              const rowKey = getRowKey(row);
              const rowContextMenu = renderRowContextMenu?.(row, index);
              const hasContextMenu = rowContextMenu != null;
              const contextOpen = openContextRowKey === rowKey;
              const dataState = contextOpen
                ? "selected"
                : getRowDataState?.(row, index);
              const clickable = onRowClick != null;
              const highlighted = clickable || hasContextMenu;

              const rowElement = (
                <TableRow
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  data-state={dataState}
                  aria-label={getRowAriaLabel?.(row, index)}
                  className={cn(
                    highlighted && "hover:bg-muted/50",
                    clickable &&
                      "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground",
                    hasContextMenu && !clickable && "cursor-context-menu",
                    rowClassName?.(row, index),
                  )}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => handleRowKeyDown(event, row)
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render(row, index)}
                    </TableCell>
                  ))}
                </TableRow>
              );

              if (!hasContextMenu) {
                return (
                  <React.Fragment key={rowKey}>{rowElement}</React.Fragment>
                );
              }

              return (
                <ContextMenu
                  key={rowKey}
                  onOpenChange={(open) =>
                    setOpenContextRowKey(open ? rowKey : null)
                  }
                >
                  <ContextMenuTrigger asChild>{rowElement}</ContextMenuTrigger>
                  <ContextMenuContent>{rowContextMenu}</ContextMenuContent>
                </ContextMenu>
              );
            })
          )}
        </TableBody>
        {(desktopFooter != null || desktopFooterRows?.length) &&
        data.length > 0 ? (
          <TableFooter>
            {desktopFooter}
            {desktopFooterRows?.map((row) => (
              <TableRow key={row.key} className={row.className}>
                {row.cells.map((cell) => (
                  <TableCell
                    key={cell.key}
                    className={cell.className}
                    colSpan={cell.colSpan}
                  >
                    {cell.content}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableFooter>
        ) : null}
      </Table>
      {showPagination && (
        <DataTablePagination
          pageSize={pageSize}
          currentPage={activePage}
          totalItems={total}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
