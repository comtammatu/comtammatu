import { matchesSearch } from "@lib/search";

export type BranchConsumptionSourceKind =
  | "pos"
  | "manual"
  | "hrm"
  | "import"
  | "other";

export type BranchRecordedConsumptionLine = {
  id: number;
  ingredientName: string;
  locationName: string;
  quantity: number;
  unit: string;
};

export type BranchRecordedConsumption = {
  orderId: number;
  orderNumber: string;
  recordedAt: string;
  locationName: string;
  sourceKind: "pos";
  sourceLabel: string;
  ingredientCount: number;
  lines: BranchRecordedConsumptionLine[];
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
      [
        row.orderNumber,
        String(row.orderId),
        row.locationName,
        row.sourceLabel,
        ...row.lines.map((line) => line.ingredientName),
      ],
      normalized,
    ),
  );
}
