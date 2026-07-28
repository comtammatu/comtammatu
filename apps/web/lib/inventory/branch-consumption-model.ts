import { matchesSearch } from "@lib/search";

export type BranchConsumptionSourceKind =
  | "pos"
  | "manual"
  | "hrm"
  | "import"
  | "other";

export type BranchRecordedConsumption = {
  id: number;
  issueId: number | null;
  orderId: number | null;
  issueCode: string | null;
  sourceKind: BranchConsumptionSourceKind;
  sourceLabel: string;
  recordedAt: string;
  locationName: string;
  ingredientName: string;
  quantity: number;
  unit: string;
};

export function resolveBranchConsumptionSourceKind({
  orderId,
  issueId,
  issueSourceType,
  reason,
}: {
  orderId: number | null;
  issueId: number | null;
  issueSourceType: string | null;
  reason: string | null;
}): BranchConsumptionSourceKind {
  if (orderId != null) return "pos";
  if (issueSourceType === "hrm_consumption") return "hrm";
  if (issueId != null) return "manual";
  if (reason?.startsWith("matu-platform import:")) return "import";
  return "other";
}

export function filterBranchRecordedConsumptions(
  rows: BranchRecordedConsumption[],
  query: string,
): BranchRecordedConsumption[] {
  const normalized = query.trim();
  if (!normalized) return rows;
  return rows.filter((row) =>
    matchesSearch(
      [row.ingredientName, row.locationName, row.sourceLabel, row.issueCode],
      normalized,
    ),
  );
}
