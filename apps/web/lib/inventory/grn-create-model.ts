import type { GrnDraftLine } from "@lib/inventory/grn-draft";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { getInventoryLocationKindLabelVi } from "@comtammatu/shared/labels";

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

export type GrnCreateServerDraftLine = GrnDraftLine & {
  lineId: number;
};

export type GrnCreateProcurementBranchOption = {
  id: number;
  name: string;
};

export type GrnCreateProcurementLocationOption = {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  branchKind: string | null;
  kind: string | null;
  isDefaultReceive: boolean;
  isDefaultConsumption: boolean;
};

export type GrnCreatePageData = {
  branchId: number | null;
  procurementBranches: GrnCreateProcurementBranchOption[];
  locationOptions: GrnCreateProcurementLocationOption[];
  canSwitchBranch: boolean;
  ingredients: GrnCreateIngredient[];
  recentLines: GrnDraftLine[];
  activeDraft: {
    draftId: number;
    branchId: number;
    locationId: number | null;
    lines: GrnCreateServerDraftLine[];
  } | null;
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

export function getGrnLocationKindLabel(
  location: GrnCreateProcurementLocationOption,
): string {
  return getInventoryLocationKindLabelVi({
    siteKind: location.branchKind,
    locationKind: location.kind,
    fallbackName: location.name,
    length: "short",
  });
}

export function pickGrnReceivingLocation(
  locations: GrnCreateProcurementLocationOption[],
  branchId: number | null,
): GrnCreateProcurementLocationOption | null {
  if (branchId == null) return null;
  const warehouses = locations.filter(
    (location) =>
      location.branchId === branchId && location.kind === "warehouse",
  );
  return warehouses.length === 1 ? warehouses[0]! : null;
}

export function resolveSoleGrnWarehouseLocation(
  locations: readonly { id: number }[],
) {
  if (locations.length === 0) return { status: "missing" } as const;
  if (locations.length > 1) return { status: "ambiguous" } as const;
  return { status: "resolved", locationId: locations[0]!.id } as const;
}

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
