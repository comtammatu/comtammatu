import type { StaffRole } from "@comtammatu/shared/auth";

/**
 * Fixed L0 inventory landing (no hub dashboard).
 * Accountant has no stock nav — land on GRN; everyone else on stock.
 */
export function resolveInventoryHomePath(
  role: StaffRole,
  branchId?: number | null,
): string {
  const base =
    role === "accountant" ? "/inventory/grn" : "/inventory/stock";
  if (branchId == null) return base;
  return `${base}?branchId=${branchId}`;
}
