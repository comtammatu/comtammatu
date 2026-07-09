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
};

export type GrnListStatusFilter = "all" | "draft" | "confirmed" | "cancelled";

export type GrnListFilters = {
  query: string;
  status: GrnListStatusFilter;
};

type GrnListSearchRow = Pick<
  GrnRow,
  "code" | "supplierName" | "poCode" | "status"
>;

export function filterGrnListRows<T extends GrnListSearchRow>(
  rows: T[],
  filters: GrnListFilters,
): T[] {
  let result = rows;
  if (filters.status !== "all") {
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
