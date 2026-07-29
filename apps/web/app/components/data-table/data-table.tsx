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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
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
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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

const DATA_TABLE_HEADER_TYPOGRAPHY =
  "font-sans text-xs font-medium uppercase tracking-wider text-muted-foreground";
const DATA_TABLE_CELL_TYPOGRAPHY = "text-xs font-normal";

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
  label?: string;
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
  mobileBreakpoint = 1024,
  desktopFooter,
  desktopFooterRows,
  mobileFooter,
}: DataTableProps<T>) {
  const isTouchLayout = useIsMobile(mobileBreakpoint);
  const controlSize = isTouchLayout ? "touch" : "field";
  const isMobile = isTouchLayout && mobileCardRender != null;
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

  function handleSearchValueChange(value: string) {
    if (currentPage == null) setInternalPage(1);
    onSearchChange?.(value);
  }

  function handleFilterValueChange(key: string, value: string) {
    if (currentPage == null) setInternalPage(1);
    onFilterChange?.(key, value);
  }

  const toolbar = hasToolbar ? (
    <AppToolbar
      variant="inline"
      search={
        searchable === true ? (
          <InputGroup
            size={controlSize}
            className="min-w-0 flex-1 sm:min-w-64"
          >
            <InputGroupAddon>
              <IconSearch aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={searchPlaceholder ?? ACTIONS_VI.search}
              value={searchValue ?? ""}
              onChange={(event) => handleSearchValueChange(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </InputGroup>
        ) : null
      }
      filters={
        filters != null && filters.length > 0
          ? filters.map((filter) => (
              <div key={filter.key} className="flex items-center gap-2">
                {filter.label ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    {filter.label}
                  </span>
                ) : null}
                <Select
                  value={filterValues?.[filter.key] ?? ""}
                  onValueChange={(value) =>
                    handleFilterValueChange(filter.key, value)
                  }
                >
                  <SelectTrigger
                    size={controlSize}
                    className="min-w-36"
                    aria-label={filter.label ?? filter.placeholder}
                  >
                    <SelectValue placeholder={filter.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {filter.options.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        size={controlSize === "touch" ? "touch" : "default"}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          : null
      }
      actions={actions}
    />
  ) : null;

  if (isMobile && mobileCardRender) {
    return (
      <div className={cn("flex flex-col", className)}>
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
          <div className="flex flex-col gap-2">
            {pagedData.map((row, index) => (
              <div key={getRowKey(row)}>
                {mobileCardRender(row, index + pageOffset)}
              </div>
            ))}
          </div>
        )}
        {data.length > 0 ? mobileFooter : null}
        {showPagination && (
          <DataTablePagination
            pageSize={pageSize}
            currentPage={activePage}
            totalItems={total}
            onPageChange={handlePageChange}
            touch={isTouchLayout}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {toolbar}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(col.className, DATA_TABLE_HEADER_TYPOGRAPHY)}
              >
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
                    <TableCell
                      key={col.key}
                      className={cn(col.className, DATA_TABLE_CELL_TYPOGRAPHY)}
                    >
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
                  <ContextMenuTrigger render={rowElement} />
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
          touch={isTouchLayout}
        />
      )}
    </div>
  );
}
