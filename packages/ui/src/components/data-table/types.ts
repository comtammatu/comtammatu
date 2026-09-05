import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  className?: string;
  /**
   * Enables column sorting. When true, clicking the column header
   * cycles sort direction (asc -> desc -> none).
   */
  sortable?: boolean;
  /**
   * Custom sort key if different from column key.
   */
  sortKey?: string;
  /**
   * Custom accessor or comparator value extractor for sorting.
   */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
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

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableFilter {
  key: string;
  label?: string;
  placeholder: string;
  options: DataTableFilterOption[];
}

export interface DataTableProps<T> {
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
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  sortKey?: string;
  sortDirection?: "asc" | "desc" | null;
  onSortChange?: (key: string, direction: "asc" | "desc" | null) => void;
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
