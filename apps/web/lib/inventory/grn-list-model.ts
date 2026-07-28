import { matchesSearch } from "@lib/search";
import { formatGrnSupplierSummary } from "./grn-create-model";

export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  branchName: string;
  poId: number | null;
  poCode: string;
  poCount: number;
  poStatus: string | null;
  invoiceId: number | null;
  date: string;
  status: string;
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

export type GrnListStatusFilter =
  "all" | "review" | "draft" | "confirmed" | "cancelled";

export type GrnListFilters = {
  query: string;
  status: GrnListStatusFilter;
};

type GrnListSearchRow = Pick<
  GrnRow,
  "code" | "supplierName" | "poCode" | "status" | "qcIssueCount"
>;

export function filterGrnListRows<T extends GrnListSearchRow>(
  rows: T[],
  filters: GrnListFilters,
): T[] {
  let result = rows;
  if (filters.status === "review") {
    result = result.filter(
      (row) => row.status === "draft" && row.qcIssueCount > 0,
    );
  } else if (filters.status !== "all") {
    result = result.filter((row) => row.status === filters.status);
  }

  const query = filters.query.trim();
  if (!query) return result;

  return result.filter((row) =>
    matchesSearch([row.code, row.supplierName, row.poCode], query),
  );
}

export function hasGrnListFilters(filters: GrnListFilters): boolean {
  return filters.query.trim() !== "" || filters.status !== "all";
}

export function grnDetailHref(basePath: string, id: number): string {
  return `${basePath}/${id}`;
}

export function supplierInvoiceHrefForGrn(opts: {
  basePath?: string;
  grnId: number;
  invoiceId: number | null;
}) {
  const base = opts.basePath ?? "/finance/supplier-invoices";
  if (opts.invoiceId != null) {
    return `${base}?invoiceId=${opts.invoiceId}`;
  }
  return `${base}?grnId=${opts.grnId}`;
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

/** Existing drafts always resume on their canonical DETAIL route. */
export function grnDraftHref(
  basePath: string,
  draft: Pick<GrnDraftRow, "grnId">,
): string {
  return `${basePath}/${draft.grnId}`;
}

type GrnDraftSearchRow = Pick<
  GrnDraftRow,
  "grnNumber" | "supplierName" | "branchName" | "poCode"
>;

export function filterGrnDraftRows<T extends GrnDraftSearchRow>(
  rows: T[],
  query: string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return rows;
  return rows.filter((row) =>
    matchesSearch(
      [row.grnNumber, row.supplierName, row.branchName, row.poCode ?? ""],
      trimmed,
    ),
  );
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
  if (
    row.poStatus === "sent" ||
    row.poStatus === "partially_received" ||
    row.poStatus === "received"
  ) {
    return "ready";
  }
  return "awaiting_po";
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

export function formatGrnListSupplierMeta(
  lines: readonly { supplierId?: number | null; supplierName?: string | null }[],
  headerName: string | null | undefined,
  fallback: string,
): string {
  const mapped = lines.flatMap((line) => {
    if (line.supplierId == null || !line.supplierName) return [];
    return [
      {
        supplierId: line.supplierId,
        supplierName: line.supplierName,
      },
    ];
  });
  if (mapped.length > 0) return formatGrnSupplierSummary(mapped);
  return headerName?.trim() || fallback;
}

export function formatGrnListPoMeta(opts: {
  sourcePos: readonly { po_number?: string | null; status?: string | null }[];
  legacyPo: { po_number?: string | null; status?: string | null } | null;
  fallback: string;
}): { poCode: string; poCount: number; poStatus: string | null } {
  if (opts.sourcePos.length > 0) {
    const first = opts.sourcePos[0]!;
    return {
      poCode:
        opts.sourcePos.length === 1
          ? (first.po_number ?? opts.fallback)
          : `${first.po_number ?? opts.fallback} +${opts.sourcePos.length - 1}`,
      poCount: opts.sourcePos.length,
      poStatus: first.status ?? null,
    };
  }
  if (opts.legacyPo) {
    return {
      poCode: opts.legacyPo.po_number ?? opts.fallback,
      poCount: 1,
      poStatus: opts.legacyPo.status ?? null,
    };
  }
  return { poCode: opts.fallback, poCount: 0, poStatus: null };
}
