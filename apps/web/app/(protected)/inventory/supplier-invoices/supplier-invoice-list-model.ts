import { diffVNDateDays, getVNDateString } from "@comtammatu/shared/time";
import { matchesSearch } from "@lib/search";
import {
  getSupplierInvoiceOutstandingAmount,
  type SupplierInvoiceRow,
} from "./supplier-invoice-row";

export const SUPPLIER_INVOICE_MATCH_STATUSES = [
  "pending",
  "matched",
  "discrepancy",
  "approved",
] as const;

export const SUPPLIER_INVOICE_PAYMENT_STATUSES = [
  "unpaid",
  "partial",
  "paid",
] as const;

export const SUPPLIER_INVOICE_VIEW_MODES = ["supplier", "po"] as const;

export type SupplierInvoiceMatchStatus =
  (typeof SUPPLIER_INVOICE_MATCH_STATUSES)[number];
export type SupplierInvoicePaymentStatus =
  (typeof SUPPLIER_INVOICE_PAYMENT_STATUSES)[number];
export type SupplierInvoiceViewMode =
  (typeof SUPPLIER_INVOICE_VIEW_MODES)[number];

export type SupplierInvoiceListFilters = {
  query: string;
  supplierId: number | null;
  matchStatus: SupplierInvoiceMatchStatus | null;
  paymentStatus: SupplierInvoicePaymentStatus | null;
  overdueOnly: boolean;
  viewMode: SupplierInvoiceViewMode;
};

export type SupplierInvoiceSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type SupplierInvoiceGroup = {
  id: string;
  supplierName: string;
  poCode: string | null;
  invoiceCount: number;
  totalAmount: number;
  paidAmount: number;
  creditAppliedAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  nextDueDate: string | null;
  primaryInvoice: SupplierInvoiceRow;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isOneOf<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
): value is T[number] {
  return value != null && (allowed as readonly string[]).includes(value);
}

function parsePositiveId(value: string | undefined) {
  if (value == null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseSupplierInvoiceListFilters(
  params: SupplierInvoiceSearchParams,
): SupplierInvoiceListFilters {
  const rawQuery = firstParam(params.q)?.trim() ?? "";
  const rawMatchStatus = firstParam(params.matchStatus);
  const rawPaymentStatus = firstParam(params.paymentStatus);
  const rawViewMode = firstParam(params.view);

  return {
    query: rawQuery.slice(0, 200),
    supplierId: parsePositiveId(firstParam(params.supplierId)),
    matchStatus: isOneOf(rawMatchStatus, SUPPLIER_INVOICE_MATCH_STATUSES)
      ? rawMatchStatus
      : null,
    paymentStatus: isOneOf(rawPaymentStatus, SUPPLIER_INVOICE_PAYMENT_STATUSES)
      ? rawPaymentStatus
      : null,
    overdueOnly: firstParam(params.overdue) === "1",
    viewMode: isOneOf(rawViewMode, SUPPLIER_INVOICE_VIEW_MODES)
      ? rawViewMode
      : "supplier",
  };
}

export function supplierInvoiceFiltersKey(filters: SupplierInvoiceListFilters) {
  return [
    filters.query,
    filters.supplierId ?? "",
    filters.matchStatus ?? "",
    filters.paymentStatus ?? "",
    filters.overdueOnly ? "1" : "0",
    filters.viewMode,
  ].join("|");
}

export function hasSupplierInvoiceListFilters(
  filters: SupplierInvoiceListFilters,
) {
  return (
    filters.query.length > 0 ||
    filters.supplierId != null ||
    filters.matchStatus != null ||
    filters.paymentStatus != null ||
    filters.overdueOnly
  );
}

export function getSupplierInvoiceDisplayMatchStatus(
  invoice: Pick<SupplierInvoiceRow, "grnId" | "matchStatus">,
) {
  return invoice.matchStatus === "matched" && invoice.grnId == null
    ? "pending"
    : invoice.matchStatus;
}

export function isSupplierInvoiceOverdue(
  invoice: Pick<
    SupplierInvoiceRow,
    "amount" | "creditAppliedAmount" | "dueDate" | "paidAmount"
  >,
  today = getVNDateString(),
) {
  if (!invoice.dueDate || getSupplierInvoiceOutstandingAmount(invoice) <= 0) {
    return false;
  }

  return diffVNDateDays(invoice.dueDate, today) > 0;
}

export function filterSupplierInvoices(
  invoices: readonly SupplierInvoiceRow[],
  filters: SupplierInvoiceListFilters,
  today = getVNDateString(),
) {
  return invoices.filter((invoice) => {
    if (
      filters.supplierId != null &&
      invoice.supplierId !== filters.supplierId
    ) {
      return false;
    }

    if (
      filters.matchStatus != null &&
      getSupplierInvoiceDisplayMatchStatus(invoice) !== filters.matchStatus
    ) {
      return false;
    }

    if (
      filters.paymentStatus != null &&
      invoice.paymentStatus !== filters.paymentStatus
    ) {
      return false;
    }

    if (filters.overdueOnly && !isSupplierInvoiceOverdue(invoice, today)) {
      return false;
    }

    return matchesSearch(
      [invoice.code, invoice.supplierName, invoice.poCode, invoice.grnCode],
      filters.query,
    );
  });
}

export function getSupplierInvoiceGroupId(
  invoice: Pick<SupplierInvoiceRow, "poId" | "supplierId">,
  viewMode: SupplierInvoiceViewMode,
) {
  if (viewMode === "supplier") return `supplier:${invoice.supplierId}`;
  return invoice.poId != null
    ? `po:${invoice.poId}`
    : `supplier:${invoice.supplierId}:no-po`;
}

export function groupSupplierInvoices(
  invoices: readonly SupplierInvoiceRow[],
  viewMode: SupplierInvoiceViewMode,
  today = getVNDateString(),
): SupplierInvoiceGroup[] {
  type MutableGroup = Omit<SupplierInvoiceGroup, "primaryInvoice"> & {
    firstInvoice: SupplierInvoiceRow;
    primaryOutstandingInvoice: SupplierInvoiceRow | null;
  };

  const groups = new Map<string, MutableGroup>();

  for (const invoice of invoices) {
    const id = getSupplierInvoiceGroupId(invoice, viewMode);
    let group = groups.get(id);

    if (!group) {
      group = {
        id,
        supplierName: invoice.supplierName,
        poCode: invoice.poCode,
        invoiceCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        creditAppliedAmount: 0,
        outstandingAmount: 0,
        overdueAmount: 0,
        overdueCount: 0,
        nextDueDate: null,
        firstInvoice: invoice,
        primaryOutstandingInvoice: null,
      };
      groups.set(id, group);
    }

    const outstandingAmount = getSupplierInvoiceOutstandingAmount(invoice);
    group.invoiceCount += 1;
    group.totalAmount += invoice.amount;
    group.paidAmount += invoice.paidAmount;
    group.creditAppliedAmount += invoice.creditAppliedAmount;
    group.outstandingAmount += outstandingAmount;

    if (group.primaryOutstandingInvoice == null && outstandingAmount > 0) {
      group.primaryOutstandingInvoice = invoice;
    }

    if (outstandingAmount > 0 && invoice.dueDate) {
      group.nextDueDate =
        group.nextDueDate == null || invoice.dueDate < group.nextDueDate
          ? invoice.dueDate
          : group.nextDueDate;
    }

    if (isSupplierInvoiceOverdue(invoice, today)) {
      group.overdueCount += 1;
      group.overdueAmount += outstandingAmount;
    }
  }

  return Array.from(groups.values())
    .map(({ firstInvoice, primaryOutstandingInvoice, ...group }) => ({
      ...group,
      primaryInvoice: primaryOutstandingInvoice ?? firstInvoice,
    }))
    .sort((left, right) => {
      const amountDiff = right.outstandingAmount - left.outstandingAmount;
      if (amountDiff !== 0) return amountDiff;

      const leftTitle =
        viewMode === "supplier"
          ? left.supplierName
          : (left.poCode ?? left.supplierName);
      const rightTitle =
        viewMode === "supplier"
          ? right.supplierName
          : (right.poCode ?? right.supplierName);
      return leftTitle.localeCompare(rightTitle, "vi");
    });
}
