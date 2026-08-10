import type { GrnDraftLine } from "@lib/inventory/grn-draft";
import type { IngredientUnitRow } from "@lib/inventory/types";

export type GrnCreateSupplierOption = {
  id: number;
  name: string;
  isPreferred?: boolean;
};

export type GrnCreateIngredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  units?: IngredientUnitRow[];
  /** Active supplier_items mappings for this ingredient. */
  suppliers: GrnCreateSupplierOption[];
};

export type GrnLineEditState = {
  ingredient: GrnCreateIngredient;
  line: GrnDraftLine | null;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
  supplierId: number | null;
  note: string;
};

export function uniqueSuppliersFromLines(
  lines: readonly Pick<GrnDraftLine, "supplierId" | "supplierName">[],
): GrnCreateSupplierOption[] {
  const seen = new Map<number, string>();
  for (const line of lines) {
    if (!seen.has(line.supplierId)) {
      seen.set(line.supplierId, line.supplierName);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

/** Default NCC for a GRN line: sole mapping, else the preferred mapping. */
export function resolveDefaultGrnSupplier(
  suppliers: readonly GrnCreateSupplierOption[],
): GrnCreateSupplierOption | null {
  if (suppliers.length === 1) return suppliers[0] ?? null;
  if (suppliers.length > 1) {
    return suppliers.find((supplier) => supplier.isPreferred === true) ?? null;
  }
  return null;
}

export function formatGrnSupplierSummary(
  lines: readonly Pick<GrnDraftLine, "supplierId" | "supplierName">[],
): string {
  const suppliers = uniqueSuppliersFromLines(lines);
  if (suppliers.length === 0) return "Theo dòng";
  if (suppliers.length === 1) return suppliers[0]!.name;
  const first = suppliers[0]!.name;
  return `${first} +${suppliers.length - 1}`;
}
