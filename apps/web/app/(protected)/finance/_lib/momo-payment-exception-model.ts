export const MOMO_PAYMENT_EXCEPTION_REVIEW_VALUES = [
  "reviewing",
  "refunded",
] as const;

export type MomoPaymentExceptionReviewValue =
  (typeof MOMO_PAYMENT_EXCEPTION_REVIEW_VALUES)[number];
export type MomoPaymentExceptionReviewStatus =
  | "open"
  | MomoPaymentExceptionReviewValue;
export type MomoPaymentExceptionReason =
  | "late_success"
  | "reconciliation_success";

export interface MomoPaymentException {
  paymentId: number;
  orderId: number | null;
  amount: number;
  paymentStatus: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  providerRef: string | null;
  transactionId: string | null;
  reasons: MomoPaymentExceptionReason[];
  reviewStatus: MomoPaymentExceptionReviewStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolutionReference: string | null;
}

export interface MomoPaymentExceptionRow {
  id: number;
  order_id: number | null;
  amount: number | string;
  status: string;
  paid_at: string | null;
  provider_ref: string | null;
  provider_data: unknown;
  created_at: string;
  updated_at: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readTransactionId(value: unknown): string | null {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : typeof value === "string"
        ? value
        : null;

  return normalized != null && /^[1-9]\d*$/.test(normalized)
    ? normalized
    : null;
}

function readFirstTransactionEvidence(...values: unknown[]): unknown {
  return values.find(
    (value) => value != null && !(typeof value === "string" && value === ""),
  );
}

function readReviewStatus(
  value: unknown,
): MomoPaymentExceptionReviewValue | null {
  return (
    MOMO_PAYMENT_EXCEPTION_REVIEW_VALUES.find((status) => status === value) ??
    null
  );
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function readTimestamp(value: unknown): string | null {
  const timestamp = readText(value);
  return timestamp != null && Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : null;
}

export function mapMomoPaymentException(
  row: MomoPaymentExceptionRow,
): MomoPaymentException | null {
  const paymentId = readPositiveInteger(row.id);
  if (paymentId == null) return null;

  const providerData = asRecord(row.provider_data);
  const reconciliation = asRecord(providerData.momoReconciliation);
  const review = asRecord(providerData.momoReview);
  const storedReviewStatus = readReviewStatus(review.status);
  const lateSuccess =
    providerData.lateSuccessRequiresReview === true ||
    providerData.lateSuccessRequiresReview === "true";
  const reconciliationSuccess =
    reconciliation.disposition === "success" &&
    reconciliation.settlementStatus !== "completed" &&
    reconciliation.settlementStatus !== "already_completed";

  if (!lateSuccess && !reconciliationSuccess && storedReviewStatus == null) {
    return null;
  }

  const reasons: MomoPaymentExceptionReason[] = [];
  if (lateSuccess) reasons.push("late_success");
  if (reconciliationSuccess) reasons.push("reconciliation_success");

  const amount = Number(row.amount);
  const createdAt = readTimestamp(row.created_at) ?? row.created_at;
  const updatedAt = readTimestamp(row.updated_at) ?? row.updated_at;
  const currentTransactionEvidence = readFirstTransactionEvidence(
    providerData.conflictingTransactionId,
    reconciliation.transactionId,
    providerData.transactionId,
  );

  return {
    paymentId,
    orderId: readPositiveInteger(row.order_id),
    amount: Number.isFinite(amount) ? amount : 0,
    paymentStatus: readText(row.status) ?? "pending",
    paidAt: readTimestamp(row.paid_at),
    createdAt,
    updatedAt,
    providerRef: readText(row.provider_ref),
    transactionId:
      currentTransactionEvidence == null
        ? readTransactionId(review.transactionId)
        : readTransactionId(currentTransactionEvidence),
    reasons,
    reviewStatus: storedReviewStatus ?? "open",
    reviewedAt: readTimestamp(review.reviewedAt),
    reviewedBy: readText(review.reviewedBy),
    resolutionReference: readText(review.resolutionReference),
  };
}

const MOMO_REVIEW_RANK: Record<MomoPaymentExceptionReviewStatus, number> = {
  open: 0,
  reviewing: 1,
  refunded: 2,
};

export function sortMomoPaymentExceptions(
  exceptions: readonly MomoPaymentException[],
): MomoPaymentException[] {
  return [...exceptions].sort((left, right) => {
    const statusDelta =
      MOMO_REVIEW_RANK[left.reviewStatus] -
      MOMO_REVIEW_RANK[right.reviewStatus];
    if (statusDelta !== 0) return statusDelta;

    const updatedDelta =
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (Number.isFinite(updatedDelta) && updatedDelta !== 0) {
      return updatedDelta;
    }
    return right.paymentId - left.paymentId;
  });
}
