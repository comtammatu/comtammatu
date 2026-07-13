import { getVNDateString } from "@comtammatu/shared/time";

export type SepayTransferType = "in" | "out";

export interface SepayDateRange {
  start: string;
  end: string;
}

export interface SepayWebhookRow {
  id: number;
  request_id: string;
  created_at: string;
  processing_status: string;
  error_code: string | null;
  order_id: number | null;
  payment_id: number | null;
  expense_id: number | null;
  payload: unknown;
}

export interface SepaySupplierPaymentMatch {
  id: number;
  invoiceId: number;
  amount: number;
  paymentDate: string;
  referenceNote: string | null;
  invoiceNumber: string | null;
  supplierName: string | null;
}

export interface SepaySupplierPaymentLink {
  eventId: number;
  payment: SepaySupplierPaymentMatch;
}

export interface SepayExpenseAllocation {
  expenseId: number;
  amount: number | null;
}

export interface SepayBankTransaction {
  eventId: number;
  requestId: string;
  createdAt: string;
  processingStatus: string;
  errorCode: string | null;
  orderId: number | null;
  paymentId: number | null;
  expenseId: number | null;
  expenseIds: number[];
  expenseAllocations: SepayExpenseAllocation[];
  expenseAllocationReady?: boolean;
  supplierPaymentMatches: SepaySupplierPaymentMatch[];
  transactionDate: string | null;
  accountNumber: string | null;
  code: string | null;
  content: string | null;
  transferType: SepayTransferType;
  amount: number;
  accumulated: number | null;
  referenceCode: string | null;
}

export interface SepayBankMovement {
  inAmount: number;
  outAmount: number;
}

export function calculateSepayBankBalance(
  openingBalance: number,
  movement: SepayBankMovement,
): number {
  return openingBalance + movement.inAmount - movement.outAmount;
}

export function isSepayExpenseAllocationBalanced(
  transactionAmount: number,
  selectedExpenseAmount: number,
  selectedExpenseCount: number,
): boolean {
  return (
    selectedExpenseCount === 0 || selectedExpenseAmount === transactionAmount
  );
}

export type SepayUnmatchedMoneyInReason =
  | "overpayment"
  | "payment_code_conflict"
  | "payment_method_conflict"
  | "payment_state_conflict"
  | "webhook_error"
  | "missing_reference"
  | "unmatched_reference";

export type SepayReconciliationState =
  | "matched"
  | "needs_review"
  | "webhook_error";

export const SEPAY_BANK_WEBHOOK_REVIEW_VALUES = [
  "reviewing",
  "resolved",
  "ignored",
] as const;

export type SepayBankWebhookReviewStatus =
  (typeof SEPAY_BANK_WEBHOOK_REVIEW_VALUES)[number];

export interface SepayBankWebhookReview {
  status: SepayBankWebhookReviewStatus | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface SepayMissingBankWebhookPayment {
  paymentId: number;
  orderId: number | null;
  amount: number;
  paidAt: string | null;
  providerRef: string | null;
  bankWebhookReviewStatus: SepayBankWebhookReviewStatus | null;
  bankWebhookReviewedAt: string | null;
  bankWebhookReviewedBy: string | null;
}

export type SepayPaymentWebhookCheck = SepayMissingBankWebhookPayment;

export interface SepayPaymentWebhookSummary {
  checkedPaymentCount: number;
  matchedPaymentCount: number;
  missingBankWebhookCount: number;
  missingBankWebhookAmount: number;
  openMissingBankWebhookCount: number;
  openMissingBankWebhookAmount: number;
  missingBankWebhookPayments: SepayMissingBankWebhookPayment[];
}

export interface SepayReconciliationSummary {
  matchedCount: number;
  needsReviewCount: number;
  needsReviewAmount: number;
  unmatchedMoneyInCount: number;
  unmatchedMoneyInAmount: number;
  unmatchedMoneyOutCount: number;
  unmatchedMoneyOutAmount: number;
  failedCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isSepayBankWebhookReviewStatus(
  value: unknown,
): value is SepayBankWebhookReviewStatus {
  return SEPAY_BANK_WEBHOOK_REVIEW_VALUES.some((status) => status === value);
}

export function isOpenSepayBankWebhookReview(
  status: SepayBankWebhookReviewStatus | null,
): boolean {
  return status !== "resolved" && status !== "ignored";
}

export function readSepayBankWebhookReview(
  providerData: unknown,
): SepayBankWebhookReview {
  const review = asRecord(asRecord(providerData)?.bankWebhookReview);
  const status = review?.status;
  return {
    status: isSepayBankWebhookReviewStatus(status) ? status : null,
    reviewedAt:
      typeof review?.reviewedAt === "string" ? review.reviewedAt : null,
    reviewedBy:
      typeof review?.reviewedBy === "string" ? review.reviewedBy : null,
  };
}

export function classifySepayUnmatchedMoneyIn(
  transaction: Pick<
    SepayBankTransaction,
    | "code"
    | "content"
    | "errorCode"
    | "processingStatus"
    | "referenceCode"
    | "transferType"
  >,
): SepayUnmatchedMoneyInReason {
  if (isSepayOverpayment(transaction)) return "overpayment";

  const paymentConflict = classifySepayPaymentConflict(transaction);
  if (paymentConflict) return paymentConflict;

  if (
    transaction.processingStatus === "failed" ||
    transaction.errorCode != null
  ) {
    return "webhook_error";
  }

  if (
    transaction.referenceCode == null &&
    transaction.code == null &&
    transaction.content == null
  ) {
    return "missing_reference";
  }

  return "unmatched_reference";
}

export function classifySepayReconciliationState(
  transaction: Pick<
    SepayBankTransaction,
    | "errorCode"
    | "expenseIds"
    | "orderId"
    | "paymentId"
    | "processingStatus"
    | "supplierPaymentMatches"
    | "transferType"
  >,
): SepayReconciliationState {
  if (
    isSepayOverpayment(transaction) ||
    classifySepayPaymentConflict(transaction) != null
  ) {
    return "needs_review";
  }

  if (
    transaction.processingStatus === "failed" ||
    (transaction.errorCode != null &&
      !isUnclassifiedMoneyOutStatus(transaction))
  ) {
    return "webhook_error";
  }

  if (
    (transaction.transferType === "in" &&
      (transaction.paymentId != null || transaction.expenseIds.length > 0)) ||
    (transaction.transferType === "out" &&
      (transaction.expenseIds.length > 0 ||
        transaction.supplierPaymentMatches.length > 0))
  ) {
    return "matched";
  }

  return "needs_review";
}

export function isSepayOverpayment(
  transaction: Pick<SepayBankTransaction, "errorCode" | "transferType">,
): boolean {
  return (
    transaction.transferType === "in" &&
    transaction.errorCode === "overpayment_needs_review"
  );
}

export function classifySepayPaymentConflict(
  transaction: Pick<SepayBankTransaction, "errorCode" | "transferType">,
):
  | "payment_code_conflict"
  | "payment_method_conflict"
  | "payment_state_conflict"
  | null {
  if (transaction.transferType !== "in") return null;
  if (transaction.errorCode === "payment_code_conflict_needs_review") {
    return "payment_code_conflict";
  }
  if (transaction.errorCode === "payment_method_conflict_needs_review") {
    return "payment_method_conflict";
  }
  if (transaction.errorCode === "payment_state_conflict_needs_review") {
    return "payment_state_conflict";
  }
  return null;
}

function readString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readTransferType(
  payload: Record<string, unknown>,
): SepayTransferType | null {
  const raw = readString(payload, "transferType")?.toLowerCase();
  return raw === "in" || raw === "out" ? raw : null;
}

export function sepayTransactionBusinessDate(
  transaction: Pick<SepayBankTransaction, "createdAt" | "transactionDate">,
): string {
  if (transaction.transactionDate) {
    const match = transaction.transactionDate.match(/^\d{4}-\d{2}-\d{2}/);
    if (match?.[0]) return match[0];
  }
  return getVNDateString(transaction.createdAt);
}

export function isSepayBusinessDateInRange(
  businessDate: string,
  range: SepayDateRange,
): boolean {
  return businessDate >= range.start && businessDate <= range.end;
}

export function isSepayTransactionInDateRange(
  transaction: Pick<SepayBankTransaction, "createdAt" | "transactionDate">,
  range: SepayDateRange,
): boolean {
  return isSepayBusinessDateInRange(
    sepayTransactionBusinessDate(transaction),
    range,
  );
}

export function mapSepayWebhookRow(
  row: SepayWebhookRow,
): SepayBankTransaction | null {
  const payload = asRecord(row.payload);
  if (!payload) return null;

  const transferType = readTransferType(payload);
  const rawAmount = readNumber(payload, "transferAmount");
  const amount = rawAmount != null ? Math.abs(rawAmount) : null;
  if (!transferType || amount == null || amount <= 0) return null;

  return {
    eventId: row.id,
    requestId: row.request_id,
    createdAt: row.created_at,
    processingStatus: row.processing_status,
    errorCode: row.error_code,
    orderId: row.order_id,
    paymentId: row.payment_id,
    expenseId: row.expense_id,
    expenseIds: row.expense_id != null ? [row.expense_id] : [],
    expenseAllocations:
      row.expense_id != null
        ? [{ expenseId: row.expense_id, amount: null }]
        : [],
    expenseAllocationReady: false,
    supplierPaymentMatches: [],
    transactionDate: readString(payload, "transactionDate"),
    accountNumber: readString(payload, "accountNumber"),
    code: readString(payload, "code"),
    content: readString(payload, "content"),
    transferType,
    amount,
    accumulated: readNumber(payload, "accumulated"),
    referenceCode: readString(payload, "referenceCode"),
  };
}

function isUnclassifiedMoneyOutStatus(
  transaction: Pick<
    SepayBankTransaction,
    "errorCode" | "processingStatus" | "transferType"
  >,
): boolean {
  return (
    transaction.transferType === "out" &&
    transaction.processingStatus === "ignored" &&
    transaction.errorCode === "transfer_type_out"
  );
}

export function attachPersistedSupplierPaymentMatches(
  transactions: SepayBankTransaction[],
  links: SepaySupplierPaymentLink[],
): SepayBankTransaction[] {
  const paymentsByEventId = new Map<number, SepaySupplierPaymentMatch[]>();
  for (const link of links) {
    const matches = paymentsByEventId.get(link.eventId) ?? [];
    if (!matches.some((payment) => payment.id === link.payment.id)) {
      matches.push(link.payment);
      paymentsByEventId.set(link.eventId, matches);
    }
  }

  return transactions.map((transaction) => ({
    ...transaction,
    supplierPaymentMatches: [
      ...(paymentsByEventId.get(transaction.eventId) ?? []),
    ].sort((left, right) => left.id - right.id),
  }));
}

export function sumSepayBankMovementSince(
  rows: SepayWebhookRow[],
  sinceDate: string,
): SepayBankMovement {
  return rows
    .map(mapSepayWebhookRow)
    .filter((tx): tx is SepayBankTransaction => tx !== null)
    .filter((tx) => sepayTransactionBusinessDate(tx) >= sinceDate)
    .reduce<SepayBankMovement>(
      (sum, tx) =>
        tx.transferType === "in"
          ? { ...sum, inAmount: sum.inAmount + tx.amount }
          : { ...sum, outAmount: sum.outAmount + tx.amount },
      { inAmount: 0, outAmount: 0 },
    );
}

export function buildSepayReconciliationSummary(
  transactions: SepayBankTransaction[],
): SepayReconciliationSummary {
  return transactions.reduce<SepayReconciliationSummary>(
    (summary, tx) => {
      const state = classifySepayReconciliationState(tx);
      if (isSepayOverpayment(tx)) {
        summary.needsReviewCount += 1;
        summary.needsReviewAmount += tx.amount;
        summary.unmatchedMoneyInCount += 1;
        summary.unmatchedMoneyInAmount += tx.amount;
        return summary;
      }

      if (state === "webhook_error") {
        summary.failedCount += 1;
        summary.needsReviewCount += 1;
        summary.needsReviewAmount += tx.amount;
        return summary;
      }

      if (state === "matched") {
        summary.matchedCount += 1;
        return summary;
      }

      if (tx.transferType === "in") {
        summary.unmatchedMoneyInCount += 1;
        summary.unmatchedMoneyInAmount += tx.amount;
        summary.needsReviewCount += 1;
        summary.needsReviewAmount += tx.amount;
        return summary;
      }

      summary.unmatchedMoneyOutCount += 1;
      summary.unmatchedMoneyOutAmount += tx.amount;
      summary.needsReviewCount += 1;
      summary.needsReviewAmount += tx.amount;
      return summary;
    },
    {
      matchedCount: 0,
      needsReviewCount: 0,
      needsReviewAmount: 0,
      unmatchedMoneyInCount: 0,
      unmatchedMoneyInAmount: 0,
      unmatchedMoneyOutCount: 0,
      unmatchedMoneyOutAmount: 0,
      failedCount: 0,
    },
  );
}

export function buildSepayPaymentWebhookSummary(
  payments: SepayPaymentWebhookCheck[],
  matchedWebhookPaymentIds: Set<number>,
): SepayPaymentWebhookSummary {
  return payments.reduce<SepayPaymentWebhookSummary>(
    (summary, payment) => {
      summary.checkedPaymentCount += 1;
      if (matchedWebhookPaymentIds.has(payment.paymentId)) {
        summary.matchedPaymentCount += 1;
      } else {
        summary.missingBankWebhookCount += 1;
        summary.missingBankWebhookAmount += payment.amount;
        if (isOpenSepayBankWebhookReview(payment.bankWebhookReviewStatus)) {
          summary.openMissingBankWebhookCount += 1;
          summary.openMissingBankWebhookAmount += payment.amount;
        }
        summary.missingBankWebhookPayments.push(payment);
      }
      return summary;
    },
    {
      checkedPaymentCount: 0,
      matchedPaymentCount: 0,
      missingBankWebhookCount: 0,
      missingBankWebhookAmount: 0,
      openMissingBankWebhookCount: 0,
      openMissingBankWebhookAmount: 0,
      missingBankWebhookPayments: [],
    },
  );
}
