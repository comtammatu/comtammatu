import { formatInventoryLocationLabelVi } from "@comtammatu/shared/labels";
import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
  type IssueUnitOption,
} from "@/(protected)/inventory/_lib/issue-units";

export interface BranchForTransfer {
  id: number;
  name: string;
  branch_kind?: string | null;
  is_active: boolean;
}

export interface TransferIngredientOption {
  id: number;
  name: string;
  is_active: boolean;
  itemKind: string | null;
  units?: IngredientUnitRow[];
}

export interface TransferDraftLine {
  key: string;
  ingredientId: number;
  name: string;
  quantity: string;
  unit: string;
  entryUnitId: string;
}

export type TransferTargetKind = "warehouse";
export type TransferSourceKind = TransferTargetKind;

export interface TransferSourceLocation {
  id: number;
  branchId: number;
  kind: TransferSourceKind;
  isDefaultIssue: boolean;
}

export interface TransferTargetOption {
  value: string;
  branch: BranchForTransfer;
  kind: TransferTargetKind;
}

export interface TransferCreatePolicy {
  currentBranch: BranchForTransfer | null;
  currentBranchKind: string | null;
  outboundSourceBranchId: number | null;
  canCreateOutbound: boolean;
  outboundDestinationOptions: TransferTargetOption[];
}

export type TransferLinesPayloadResult =
  | {
      success: true;
      lines: Array<{
        ingredientId: number;
        quantity: number;
        entryUnitId: number | null;
      }>;
    }
  | {
      success: false;
      error: "empty_lines" | "invalid_line" | "exceeds_stock";
    };

export function getTransferWarehouseUnit(
  ingredient: TransferIngredientOption,
): string {
  return ingredient.units?.find((unit) => unit.is_base)?.unit_code || "";
}

export function withTransferBranchQuery(
  path: string,
  branchId: number | null,
): string {
  return branchId == null ? path : `${path}?branchId=${branchId}`;
}

export function isTransferSourceKind(kind: string | null | undefined): boolean {
  return (
    kind === "branch" || kind === "central_supply" || kind === "central_kitchen"
  );
}

export function formatTransferLocationLabel(
  branch: BranchForTransfer,
  kind: TransferSourceKind,
): string {
  return formatInventoryLocationLabelVi({
    branchName: branch.name,
    siteKind: branch.branch_kind,
    locationKind: kind,
  });
}

export function transferTargetValue(
  branchId: number,
  kind: TransferTargetKind,
): string {
  return `${branchId}:${kind}`;
}

export function parseTransferTargetValue(value: string): {
  branchId: number;
  kind: TransferTargetKind;
} | null {
  const [branchIdRaw, kindRaw] = value.split(":");
  const branchId = Number(branchIdRaw);
  if (!Number.isInteger(branchId) || branchId <= 0) return null;
  if (kindRaw !== "warehouse") return null;
  return { branchId, kind: kindRaw };
}

export function formatTransferTargetOption(
  option: TransferTargetOption,
): string {
  return formatTransferLocationLabel(option.branch, option.kind);
}

export function getDefaultTransferSourceLocation(
  locations: TransferSourceLocation[],
): TransferSourceLocation | null {
  return (
    locations.find((location) => location.isDefaultIssue) ??
    locations[0] ??
    null
  );
}

export function getTransferSourceLocationOptions({
  locations,
}: {
  locations: TransferSourceLocation[];
}): TransferSourceLocation[] {
  return locations.filter((location) => location.kind === "warehouse");
}

export function getTransferSelectableIngredients({
  ingredients,
  sourceBranchKind,
}: {
  ingredients: TransferIngredientOption[];
  sourceBranchKind: string | null;
}): TransferIngredientOption[] {
  return ingredients.filter(
    (ingredient) =>
      ingredient.is_active &&
      (sourceBranchKind !== "central_kitchen" ||
        ingredient.itemKind === "finished_good"),
  );
}

export function getTransferOutboundDestinationOptions({
  branches,
  sourceBranchId,
  sourceBranchKind,
  sourceLocationKind,
}: {
  branches: BranchForTransfer[];
  sourceBranchId: number | null;
  sourceBranchKind: string | null;
  sourceLocationKind: TransferSourceKind;
}): TransferTargetOption[] {
  if (sourceBranchId == null || sourceBranchKind == null) return [];
  void sourceLocationKind;

  return branches.flatMap((branch) => {
    if (!branch.is_active) return [];
    if (branch.id === sourceBranchId) return [];

    const branchKind = branch.branch_kind ?? "branch";
    if (sourceBranchKind === "central_kitchen") {
      if (branchKind !== "branch") return [];
      return [
        {
          value: transferTargetValue(branch.id, "warehouse"),
          branch,
          kind: "warehouse" as const,
        },
      ];
    }

    if (
      sourceBranchKind === "central_supply" &&
      (branchKind === "branch" || branchKind === "central_kitchen")
    ) {
      return [
        {
          value: transferTargetValue(branch.id, "warehouse"),
          branch,
          kind: "warehouse" as const,
        },
      ];
    }

    if (sourceBranchKind === "branch" && branchKind === "central_kitchen") {
      return [
        {
          value: transferTargetValue(branch.id, "warehouse"),
          branch,
          kind: "warehouse" as const,
        },
      ];
    }
    if (branchKind !== "branch") return [];
    return [
      {
        value: transferTargetValue(branch.id, "warehouse"),
        branch,
        kind: "warehouse" as const,
      },
    ];
  });
}

export function resolveTransferCreatePolicy({
  branches,
  userBranchId,
}: {
  branches: BranchForTransfer[];
  userBranchId: number | null;
}): TransferCreatePolicy {
  const currentBranch =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId) ?? null);
  const currentBranchKind = currentBranch?.branch_kind ?? null;
  const outboundSourceBranchId = userBranchId;
  const canCreateOutbound =
    outboundSourceBranchId != null && isTransferSourceKind(currentBranchKind);
  const outboundDestinationOptions = canCreateOutbound
    ? getTransferOutboundDestinationOptions({
        branches,
        sourceBranchId: outboundSourceBranchId,
        sourceBranchKind: currentBranchKind,
        sourceLocationKind: "warehouse",
      })
    : [];

  return {
    currentBranch,
    currentBranchKind,
    outboundSourceBranchId,
    canCreateOutbound,
    outboundDestinationOptions,
  };
}

export function createTransferDraftLine(
  ingredient: TransferIngredientOption,
  key: string,
): TransferDraftLine {
  const defaultUnit = getDefaultIssueUnit(ingredient);
  return {
    key,
    ingredientId: ingredient.id,
    name: ingredient.name,
    quantity: "",
    unit: defaultUnit?.label ?? getTransferWarehouseUnit(ingredient),
    entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
  };
}

export function getTransferLineIssueUnit(
  line: TransferDraftLine,
  ingredients: TransferIngredientOption[],
): IssueUnitOption | undefined {
  const ingredient = ingredients.find((item) => item.id === line.ingredientId);
  return getIssueUnitOptions(ingredient).find(
    (option) => String(option.unitId) === line.entryUnitId,
  );
}

export function getTransferLineMaxEntryQuantity({
  line,
  ingredients,
  sourceStockByLocation,
  sourceLocationId,
}: {
  line: TransferDraftLine;
  ingredients: TransferIngredientOption[];
  sourceStockByLocation: Record<number, Record<number, number>>;
  sourceLocationId: number | null;
}): number {
  if (sourceLocationId == null) return 0;
  const availableBaseQuantity =
    sourceStockByLocation[sourceLocationId]?.[line.ingredientId] ?? 0;
  return getIssueMaxEntryQuantity(
    availableBaseQuantity,
    getTransferLineIssueUnit(line, ingredients),
  );
}

export function clampTransferLineForSource({
  line,
  ingredients,
  sourceStockByLocation,
  sourceLocationId,
}: {
  line: TransferDraftLine;
  ingredients: TransferIngredientOption[];
  sourceStockByLocation: Record<number, Record<number, number>>;
  sourceLocationId: number | null;
}): TransferDraftLine {
  return {
    ...line,
    quantity: clampIssueEntryQuantity(
      line.quantity,
      getTransferLineMaxEntryQuantity({
        line,
        ingredients,
        sourceStockByLocation,
        sourceLocationId,
      }),
    ),
  };
}

export function buildTransferLinesPayload({
  lines,
  ingredients,
  sourceStockByLocation,
  sourceLocationId,
}: {
  lines: TransferDraftLine[];
  ingredients: TransferIngredientOption[];
  sourceStockByLocation: Record<number, Record<number, number>>;
  sourceLocationId: number | null;
}): TransferLinesPayloadResult {
  if (lines.length === 0) {
    return { success: false, error: "empty_lines" };
  }

  const payload: Extract<
    TransferLinesPayloadResult,
    { success: true }
  >["lines"] = [];

  for (const line of lines) {
    const quantity = Number(line.quantity);
    const unit = line.unit.trim();
    const entryUnitId = line.entryUnitId ? Number(line.entryUnitId) : null;
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !unit ||
      (entryUnitId != null &&
        (!Number.isInteger(entryUnitId) || entryUnitId <= 0))
    ) {
      return { success: false, error: "invalid_line" };
    }
    const issueUnit = getTransferLineIssueUnit(line, ingredients);
    if (!issueUnit) return { success: false, error: "invalid_line" };
    const maxEntryQuantity = getTransferLineMaxEntryQuantity({
      line,
      ingredients,
      sourceStockByLocation,
      sourceLocationId,
    });
    if (
      getIssueBaseQuantity(quantity, issueUnit) >
      getIssueBaseQuantity(maxEntryQuantity, issueUnit) + 1e-9
    ) {
      return { success: false, error: "exceeds_stock" };
    }
    payload.push({
      ingredientId: line.ingredientId,
      quantity,
      entryUnitId,
    });
  }

  return { success: true, lines: payload };
}

export function createAllAvailableTransferLines({
  ingredients,
  sourceStock,
}: {
  ingredients: TransferIngredientOption[];
  sourceStock: Record<number, number>;
}): TransferDraftLine[] {
  return ingredients.flatMap((ingredient) => {
    const defaultUnit = getDefaultIssueUnit(ingredient);
    const quantity = formatIssueMaxEntryQuantity(
      getIssueMaxEntryQuantity(sourceStock[ingredient.id] ?? 0, defaultUnit),
    );
    if (!quantity) return [];
    return [
      {
        key: `all-${ingredient.id}`,
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity,
        unit: defaultUnit?.label ?? getTransferWarehouseUnit(ingredient),
        entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
      },
    ];
  });
}
