import type { GrnDraftLine } from "@lib/inventory/grn-draft";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { getInventoryLocationKindLabelVi } from "@comtammatu/shared/labels";

export type GrnCreateIngredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost: number | null;
  category: string | null;
  units?: IngredientUnitRow[];
};

export type GrnCreateServerDraftLine = Omit<GrnDraftLine, "unitCost"> & {
  lineId: number;
  unitCost: number;
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
  initialLocationId: number | null;
  canSwitchBranch: boolean;
  ingredients: GrnCreateIngredient[];
  recentLines: GrnDraftLine[];
  existingDraft: {
    id: number;
    lines: GrnCreateServerDraftLine[];
  } | null;
  canConfirm: boolean;
};

export type GrnLineEditState = {
  ingredient: GrnCreateIngredient;
  line: GrnDraftLine | null;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
  unitCost: number | null;
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
  preferredLocationId: number | null = null,
): GrnCreateProcurementLocationOption | null {
  const candidates = branchId
    ? locations.filter((location) => location.branchId === branchId)
    : locations;

  return (
    candidates.find((location) => location.id === preferredLocationId) ??
    candidates.find(
      (location) =>
        location.branchKind === "branch" && location.kind === "warehouse",
    ) ??
    candidates.find(
      (location) =>
        location.branchKind === "central_kitchen" &&
        location.kind === "production_storage",
    ) ??
    candidates.find((location) => location.isDefaultReceive) ??
    candidates[0] ??
    null
  );
}

export function resolveSoleGrnWarehouseLocation(
  locations: readonly { id: number }[],
) {
  if (locations.length === 0) return { status: "missing" } as const;
  if (locations.length > 1) return { status: "ambiguous" } as const;
  return { status: "resolved", locationId: locations[0]!.id } as const;
}

export function isSameGrnReferenceCost(
  currentCost: number,
  referenceCost: { value: number } | null,
): boolean {
  return (
    referenceCost != null && Math.abs(currentCost - referenceCost.value) < 0.01
  );
}
