import type { GrnDraftLine } from "@lib/inventory/grn-draft";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { getInventoryLocationKindLabelVi } from "@comtammatu/shared/labels";

export type GrnCreateIngredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  units?: IngredientUnitRow[];
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
  supplier: { id: number; name: string };
  branchId: number | null;
  procurementBranches: GrnCreateProcurementBranchOption[];
  locationOptions: GrnCreateProcurementLocationOption[];
  canSwitchBranch: boolean;
  ingredients: GrnCreateIngredient[];
  recentLines: GrnDraftLine[];
};

export type GrnLineEditState = {
  ingredient: GrnCreateIngredient;
  line: GrnDraftLine | null;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
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
