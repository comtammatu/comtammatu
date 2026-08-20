import { matchesSearch } from "@lib/search";
import { isBranchScopedProcurementRole } from "@comtammatu/shared/auth";
import { OWNER_UNPRICED_GRN_STATUS } from "./grn-unpriced-queue-model";

export type GrnListStatusFilter =
  | "draft"
  | "confirmed"
  | "cancelled"
  | "all"
  | typeof OWNER_UNPRICED_GRN_STATUS;

export type GrnListDateField = "expected" | "received";

export type GrnListFilters = {
  query: string;
  status: GrnListStatusFilter;
  supplierId: number | null;
  dateField: GrnListDateField;
  dateFrom: string;
  dateTo: string;
  poId: number | null;
  purchaseRequestId: number | null;
  branchId: number | null;
};

export type GrnListRow = {
  id: number;
  code: string;
  status: string;
  supplierId: number | null;
  supplierName: string;
  poId: number;
  poCode: string;
  purchaseRequestId: number | null;
  purchaseRequestCode: string | null;
  receivingSiteId: number;
  receivingSiteName: string;
  expectedReceiveDate: string | null;
  receivedDate: string | null;
  lineCount: number;
  completedLineCount: number;
  shortageLineCount: number;
  excessLineCount: number;
  rejectedLineCount: number;
  updatedAt: string;
  handledBy: string | null;
  /** Invoice link for valuation status — not a monetary amount. */
  invoiceId: number | null;
  monetary: {
    receiptValue: number;
    invoiceId: number | null;
    invoiceStatus: string | null;
  } | null;
};

export const GRN_LIST_STATUS_FILTER_VALUES = [
  "draft",
  "confirmed",
  "cancelled",
  "all",
] as const satisfies readonly GrnListStatusFilter[];

export function parsePositiveId(
  value: string | string[] | undefined,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseGrnListStatus(
  value: string | string[] | undefined,
): GrnListStatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === OWNER_UNPRICED_GRN_STATUS) return OWNER_UNPRICED_GRN_STATUS;
  return GRN_LIST_STATUS_FILTER_VALUES.includes(
    raw as (typeof GRN_LIST_STATUS_FILTER_VALUES)[number],
  )
    ? (raw as (typeof GRN_LIST_STATUS_FILTER_VALUES)[number])
    : "draft";
}

/** Warehouse GRN chrome never offers HĐ NCC; Owner/accountant keep Finance handoff. */
export function canShowGrnInvoiceChrome(role: string | null | undefined): boolean {
  return role != null && !isBranchScopedProcurementRole(role);
}

export function defaultGrnDateField(
  status: GrnListStatusFilter,
): GrnListDateField {
  return status === "draft" ? "expected" : "received";
}

export function grnDetailHref(basePath: string, id: number): string {
  return `${basePath}/${id}`;
}

export function filterGrnListRows<
  T extends Pick<
    GrnRow,
    "code" | "supplierName" | "poCode" | "status" | "qcIssueCount"
  >,
>(
  rows: T[],
  filters: Pick<GrnListFilters, "query" | "status">,
): T[] {
  const byStatus =
    filters.status === "all"
      ? rows
      : rows.filter((row) => row.status === filters.status);
  const query = filters.query.trim();
  return query
    ? byStatus.filter((row) =>
        matchesSearch([row.code, row.supplierName, row.poCode], query),
      )
    : byStatus;
}

export type GrnProcurementStepChip = "no_po" | "awaiting_po" | "ready";

export function grnProcurementStepChip(row: {
  status: string;
  poId: number | null;
  poCount?: number;
  poStatus?: string | null;
}): GrnProcurementStepChip | null {
  if (row.status !== "draft") return null;
  if (row.poId == null && (row.poCount == null || row.poCount === 0)) {
    return "no_po";
  }
  return ["sent", "partially_received", "received"].includes(
    row.poStatus ?? "",
  )
    ? "ready"
    : "awaiting_po";
}

export function grnProcurementStepChipLabel(
  chip: GrnProcurementStepChip,
  copy: {
    stepChipNoPo: string;
    stepChipAwaitingPo: string;
    stepChipReadyConfirm: string;
  },
): string {
  if (chip === "no_po") return copy.stepChipNoPo;
  if (chip === "awaiting_po") return copy.stepChipAwaitingPo;
  return copy.stepChipReadyConfirm;
}

export function supplierInvoiceHrefForGrn(opts: {
  basePath?: string;
  grnId: number;
  invoiceId: number | null;
}) {
  const base = opts.basePath ?? "/finance/supplier-invoices";
  return opts.invoiceId == null
    ? `${base}?grnId=${opts.grnId}`
    : `${base}?invoiceId=${opts.invoiceId}`;
}

export function hasGrnListFilters(filters: GrnListFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.supplierId != null ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.poId != null ||
    filters.purchaseRequestId != null
  );
}

// Branch GRN is retired by D093; these shapes keep its redirect-era surface
// compiling without maintaining a second control-surface DataTable model.
export type GrnRow = GrnListRow & {
  branchName: string;
  poCount: number;
  poStatus: string | null;
  invoiceId: number | null;
  date: string;
  qcIssueCount: number;
};

export type GrnDraftRow = {
  grnId: number;
  supplierId: number | null;
  branchId: number;
  poId: number | null;
  poCode: string | null;
  poCount: number;
  poStatus: string | null;
  supplierName: string;
  branchName: string;
  grnNumber: string;
  updatedAt: string;
  lineCount: number;
  qcIssueCount: number;
};

export function grnDraftHref(
  basePath: string,
  draft: Pick<GrnDraftRow, "grnId">,
): string {
  return `${basePath}/${draft.grnId}`;
}

export function filterGrnDraftRows<T extends GrnDraftRow>(
  rows: T[],
  query: string,
): T[] {
  const needle = query.trim();
  if (!needle) return rows;
  return rows.filter((row) =>
    matchesSearch(
      [row.grnNumber, row.supplierName, row.branchName, row.poCode ?? ""],
      needle,
    ),
  );
}

export function newGrnSupplierHref(
  basePath: string,
  supplierId: number,
  branchId: number,
): string {
  const params = new URLSearchParams({
    supplierId: String(supplierId),
    branchId: String(branchId),
  });
  return `${basePath}/new?${params.toString()}`;
}
