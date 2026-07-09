import type { StaffRole } from "@comtammatu/shared/auth";
import type { IngredientUnitRow } from "@/(protected)/inventory/_lib/types";
import { formatBranchSiteLabel } from "@/(protected)/inventory/_lib/branch-site-labels";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
  type IssueUnitOption,
} from "@/(protected)/inventory/_lib/issue-units";
import { messages } from "@lib/messages";

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

export type TransferTargetKind = "warehouse" | "kitchen";

export interface TransferTargetOption {
  value: string;
  branch: BranchForTransfer;
  kind: TransferTargetKind;
}

export interface TransferCreatePolicy {
  isBranchManager: boolean;
  currentBranch: BranchForTransfer | null;
  currentBranchKind: string | null;
  outboundSourceBranchId: number | null;
  canCreateOutbound: boolean;
  requestDestinationBranchId: number | null;
  canCreateInboundRequest: boolean;
  outboundDestinationOptions: TransferTargetOption[];
  inboundSourceOptions: BranchForTransfer[];
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

export function formatTransferSiteLabel(branch: BranchForTransfer): string {
  if ((branch.branch_kind ?? "branch") === "branch") return branch.name;
  return formatBranchSiteLabel(branch);
}

export function formatTransferOption(
  branch: BranchForTransfer,
  homeBranchId: number | null,
): string {
  const label = formatTransferSiteLabel(branch);
  if (homeBranchId != null && branch.id === homeBranchId) {
    return `${label}${messages.inventory.transfer.defaultWarehouseSuffix}`;
  }
  return label;
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
  if (kindRaw !== "warehouse" && kindRaw !== "kitchen") return null;
  return { branchId, kind: kindRaw };
}

export function formatTransferTargetOption(
  option: TransferTargetOption,
): string {
  const suffix =
    option.kind === "kitchen"
      ? messages.inventory.transfer.defaultKitchenSuffix
      : messages.inventory.transfer.defaultWarehouseSuffix;
  return `${formatTransferSiteLabel(option.branch)}${suffix}`;
}

export function resolveTransferCreatePolicy({
  branches,
  userBranchId,
  userRole,
}: {
  branches: BranchForTransfer[];
  userBranchId: number | null;
  userRole: StaffRole;
}): TransferCreatePolicy {
  const isBranchManager = userRole === "branch_manager";
  const currentBranch =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId) ?? null);
  const currentBranchKind = currentBranch?.branch_kind ?? null;
  const outboundSourceBranchId = userBranchId;
  const canCreateOutbound =
    !isBranchManager &&
    outboundSourceBranchId != null &&
    isTransferSourceKind(currentBranchKind);
  const requestDestinationBranchId =
    isBranchManager && currentBranchKind === "branch" ? userBranchId : null;
  const canCreateInboundRequest = requestDestinationBranchId != null;
  const outboundDestinationOptions = canCreateOutbound
    ? branches.flatMap((branch) => {
        if (!branch.is_active) return [];
        if (branch.id === outboundSourceBranchId) {
          return currentBranchKind === "branch"
            ? [
                {
                  value: transferTargetValue(branch.id, "kitchen"),
                  branch,
                  kind: "kitchen" as const,
                },
              ]
            : [];
        }
        if ((branch.branch_kind ?? "branch") !== "branch") return [];
        return [
          {
            value: transferTargetValue(branch.id, "warehouse"),
            branch,
            kind: "warehouse" as const,
          },
          {
            value: transferTargetValue(branch.id, "kitchen"),
            branch,
            kind: "kitchen" as const,
          },
        ];
      })
    : [];
  const inboundSourceOptions = canCreateInboundRequest
    ? branches.filter((branch) => {
        if (!branch.is_active) return false;
        const kind = branch.branch_kind ?? "branch";
        if (branch.id === requestDestinationBranchId) return kind === "branch";
        return kind === "central_supply" || kind === "central_kitchen";
      })
    : [];

  return {
    isBranchManager,
    currentBranch,
    currentBranchKind,
    outboundSourceBranchId,
    canCreateOutbound,
    requestDestinationBranchId,
    canCreateInboundRequest,
    outboundDestinationOptions,
    inboundSourceOptions,
  };
}

export function getTransferSourceBranchIds({
  branches,
  userBranchId,
  userRole,
}: {
  branches: BranchForTransfer[];
  userBranchId: number | null;
  userRole: StaffRole;
}): number[] {
  if (userRole !== "branch_manager") {
    return userBranchId == null ? [] : [userBranchId];
  }

  return branches
    .filter((branch) => {
      if (!branch.is_active) return false;
      const kind = branch.branch_kind ?? "branch";
      return (
        branch.id === userBranchId ||
        kind === "central_supply" ||
        kind === "central_kitchen"
      );
    })
    .map((branch) => branch.id);
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
  sourceStockByBranch,
  sourceBranchId,
}: {
  line: TransferDraftLine;
  ingredients: TransferIngredientOption[];
  sourceStockByBranch: Record<number, Record<number, number>>;
  sourceBranchId: number | null;
}): number {
  if (sourceBranchId == null) return 0;
  const availableBaseQuantity =
    sourceStockByBranch[sourceBranchId]?.[line.ingredientId] ?? 0;
  return getIssueMaxEntryQuantity(
    availableBaseQuantity,
    getTransferLineIssueUnit(line, ingredients),
  );
}

export function clampTransferLineForSource({
  line,
  ingredients,
  sourceStockByBranch,
  sourceBranchId,
}: {
  line: TransferDraftLine;
  ingredients: TransferIngredientOption[];
  sourceStockByBranch: Record<number, Record<number, number>>;
  sourceBranchId: number | null;
}): TransferDraftLine {
  return {
    ...line,
    quantity: clampIssueEntryQuantity(
      line.quantity,
      getTransferLineMaxEntryQuantity({
        line,
        ingredients,
        sourceStockByBranch,
        sourceBranchId,
      }),
    ),
  };
}

export function buildTransferLinesPayload({
  lines,
  ingredients,
  sourceStockByBranch,
  sourceBranchId,
}: {
  lines: TransferDraftLine[];
  ingredients: TransferIngredientOption[];
  sourceStockByBranch: Record<number, Record<number, number>>;
  sourceBranchId: number | null;
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
    const maxEntryQuantity = getTransferLineMaxEntryQuantity({
      line,
      ingredients,
      sourceStockByBranch,
      sourceBranchId,
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
