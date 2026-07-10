export const BRANCH_SUPPLIER_RETURN_RESOLUTIONS = [
  "replacement",
  "credit_note",
  "cash_refund",
] as const;

export const BRANCH_SUPPLIER_RETURN_REASONS = [
  "damaged",
  "wrong_item",
  "expired",
  "quality_fail",
  "short_delivery_credit",
  "other",
] as const;

export type BranchSupplierReturnResolution =
  (typeof BRANCH_SUPPLIER_RETURN_RESOLUTIONS)[number];

export type BranchSupplierReturnReason =
  (typeof BRANCH_SUPPLIER_RETURN_REASONS)[number];

export type BranchSupplierReturnKnownStatus =
  | "draft"
  | "sent"
  | "credited"
  | "refunded"
  | "cancelled";

export type BranchSupplierReturnStatus =
  | BranchSupplierReturnKnownStatus
  | "unknown";

export type BranchSupplierReturnStatusFilter =
  | "all"
  | BranchSupplierReturnKnownStatus;

export type BranchSupplierReturn = {
  id: number;
  code: string;
  status: BranchSupplierReturnStatus;
  reason: string;
  resolution: string;
  createdAt: string;
  sentAt: string | null;
  notes: string | null;
  branchId: number;
  supplierName: string;
  grnId: number | null;
  grnNumber: string | null;
};

export type BranchSupplierReturnLine = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  reasonDetail: string | null;
};

export type BranchReturnableGrn = {
  id: number;
  code: string;
  receivedDate: string | null;
  supplierName: string;
  rejectedLines: number;
};

export type BranchSupplierReturnDetail = {
  returnRecord: BranchSupplierReturn;
  lines: BranchSupplierReturnLine[];
  canConfirm: boolean;
};

export function toBranchSupplierReturnStatus(
  value: string,
): BranchSupplierReturnStatus {
  switch (value) {
    case "draft":
    case "sent":
    case "credited":
    case "refunded":
    case "cancelled":
      return value;
    default:
      return "unknown";
  }
}

export function filterBranchSupplierReturns(
  returns: BranchSupplierReturn[],
  {
    query,
    status,
  }: {
    query: string;
    status: BranchSupplierReturnStatusFilter;
  },
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");

  return returns.filter((returnRecord) => {
    if (status !== "all" && returnRecord.status !== status) return false;
    if (!normalizedQuery) return true;

    return [
      returnRecord.code,
      returnRecord.supplierName,
      returnRecord.grnNumber ?? "",
      returnRecord.reason,
      returnRecord.resolution,
      returnRecord.notes ?? "",
    ].some((value) => value.toLocaleLowerCase("vi").includes(normalizedQuery));
  });
}

export function canProgressBranchSupplierReturn({
  returnRecord,
  canConfirm,
}: Pick<BranchSupplierReturnDetail, "returnRecord" | "canConfirm">) {
  return (
    canConfirm &&
    (returnRecord.status === "draft" || returnRecord.status === "sent")
  );
}
