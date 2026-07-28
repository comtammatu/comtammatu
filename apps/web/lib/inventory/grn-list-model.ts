import { matchesSearch } from "@lib/search";

export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  branchName: string;
  poId: number | null;
  poCode: string;
  date: string;
  total: number;
  status: string;
  qcIssueCount: number;
};

export type GrnDraftRow = {
  grnId: number;
  supplierId: number;
  branchId: number;
  poId: number | null;
  poCode: string | null;
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

/** PO-linked drafts resume on DETAIL; free drafts resume on create with supplier+branch. */
export function grnDraftHref(
  basePath: string,
  draft: Pick<GrnDraftRow, "grnId" | "poId" | "supplierId" | "branchId">,
): string {
  return draft.poId != null
    ? `${basePath}/${draft.grnId}`
    : newGrnSupplierHref(basePath, draft.supplierId, draft.branchId);
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
