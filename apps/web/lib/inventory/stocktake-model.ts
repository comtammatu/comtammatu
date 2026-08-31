export type BranchStocktakeStatus = "in_progress" | "completed" | "cancelled";

export type BranchStocktakeSession = {
  id: number;
  sessionNumber: string;
  branchId: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: string;
  createdByName: string;
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
  units?: BranchStocktakeCountUnit[];
};

export type BranchStocktakeDetail = {
  session: Omit<BranchStocktakeSession, "totalItems" | "countedItems"> & {
    blindMode: boolean;
    currentRound: number;
  };
  lines: BranchStocktakeLine[];
  canCancel: boolean;
  canComplete: boolean;
  unitOptionsByIngredient?: Record<number, BranchStocktakeCountUnit[]>;
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

export type DraftCounts = Record<
  string,
  { qty: number; note?: string; savedAt?: string }
>;

type StocktakeCountSeedLine = {
  ingredientId: number;
  roundNo: number;
  countedQuantity: number | null;
  countedAt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDraftCounts(value: unknown): DraftCounts {
  if (!isRecord(value)) return {};

  const counts: DraftCounts = {};
  for (const [ingredientId, entry] of Object.entries(value)) {
    if (!/^\d+$/.test(ingredientId) || !isRecord(entry)) continue;
    const qty = entry.qty;
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty < 0) continue;

    counts[ingredientId] = {
      qty,
      ...(typeof entry.note === "string" ? { note: entry.note } : {}),
      ...(typeof entry.savedAt === "string" ? { savedAt: entry.savedAt } : {}),
    };
  }
  return counts;
}

export function parseStocktakeDraftCounts(
  value: unknown,
  currentRound: number,
): DraftCounts {
  if (!isRecord(value)) return {};

  if ("roundNo" in value || "counts" in value) {
    if (value.roundNo !== currentRound) return {};
    return normalizeDraftCounts(value.counts);
  }

  // Drafts written before round metadata was added can only belong to round 1.
  return currentRound === 1 ? normalizeDraftCounts(value) : {};
}

export function buildInitialStocktakeCounts(
  lines: StocktakeCountSeedLine[],
  currentRound: number,
  draftCounts: DraftCounts,
): DraftCounts {
  const currentLines = lines.filter((line) => line.roundNo === currentRound);
  const allowedIngredientIds = new Set(
    currentLines.map((line) => String(line.ingredientId)),
  );
  const counts: DraftCounts = {};

  for (const [ingredientId, entry] of Object.entries(draftCounts)) {
    if (allowedIngredientIds.has(ingredientId)) counts[ingredientId] = entry;
  }

  for (const line of currentLines) {
    if (line.countedQuantity === null) continue;
    counts[String(line.ingredientId)] = {
      qty: line.countedQuantity,
      ...(line.countedAt ? { savedAt: line.countedAt } : {}),
    };
  }

  return counts;
}

export type BranchStocktakeCountData = {
  sessionId: number;
  sessionNumber: string;
  branchId: number;
  status: BranchStocktakeStatus;
  blindMode: boolean;
  currentRound: 1 | 2 | 3 | 4;
  lines: BranchStocktakeCountLine[];
  initialDraftCounts: DraftCounts;
  unitOptionsByIngredient: Record<number, BranchStocktakeCountUnit[]>;
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
