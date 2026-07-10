export type BranchStocktakeStatus = "in_progress" | "completed" | "cancelled";

export type BranchStocktakeSession = {
  id: number;
  branchId: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: string;
  status: BranchStocktakeStatus;
  notes: string | null;
  totalItems: number;
  countedItems: number;
};

export type BranchStocktakeLocation = {
  id: number;
  name: string;
  kind: string | null;
};

export type BranchStocktakeLine = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  countedQuantity: number | null;
  varianceReason: string | null;
  needsRecount: boolean;
  systemQuantity: number | null;
  variance: number | null;
};

export type BranchStocktakeDetail = {
  session: Omit<BranchStocktakeSession, "totalItems" | "countedItems"> & {
    blindMode: boolean;
    currentRound: number;
  };
  lines: BranchStocktakeLine[];
  canCancel: boolean;
  canComplete: boolean;
};

export type BranchStocktakeCountUnit = {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
  toBaseFactor: number;
};

export type BranchStocktakeCountLine = {
  lineId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  abcClass: "A" | "B" | "C" | null;
  roundNo: number;
  countedQuantity: number | null;
  countedBy: string | null;
  countedAt: string | null;
  needsRecount: boolean;
  isFinal: boolean;
};

export type BranchStocktakeCountData = {
  sessionId: number;
  branchId: number;
  status: BranchStocktakeStatus;
  blindMode: boolean;
  currentRound: 1 | 2 | 3 | 4;
  lines: BranchStocktakeCountLine[];
  unitOptionsByIngredient: Record<number, BranchStocktakeCountUnit[]>;
  featureEnabled: boolean;
};

export function getBranchStocktakeProgress({
  totalItems,
  countedItems,
}: Pick<BranchStocktakeSession, "totalItems" | "countedItems">) {
  const total = Math.max(totalItems, 0);
  const counted = Math.min(Math.max(countedItems, 0), total);

  return {
    total,
    counted,
    percent: total === 0 ? 0 : Math.round((counted / total) * 100),
  };
}

export function canCompleteBranchStocktake(lines: BranchStocktakeLine[]) {
  return lines.every(
    (line) => line.countedQuantity !== null && !line.needsRecount,
  );
}

export function getBranchStocktakeVarianceTone(line: BranchStocktakeLine) {
  if (line.variance === null || line.systemQuantity === null) return "default";
  if (line.systemQuantity === 0) return "warning";

  const ratio = Math.abs(line.variance) / Math.abs(line.systemQuantity);
  if (ratio < 0.01) return "success";
  if (ratio < 0.05) return "warning";
  return "destructive";
}
