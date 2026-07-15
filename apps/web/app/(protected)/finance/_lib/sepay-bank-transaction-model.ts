import { getVNDateString } from "@comtammatu/shared/time";

const SEPAY_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))[ T]((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?)$/;
const EXPLICIT_TIME_ZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

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
  orders?:
    | { order_number?: string | null }
    | Array<{ order_number?: string | null }>
    | null;
  payload: unknown;
}

export interface SepaySupplierPaymentMatch {
  id: number;
  invoiceId: number;
  amount: number;
  paymentDate: string;
  referenceNote: string | null;
  webhookEventId: number | null;
  invoiceNumber: string | null;
  supplierName: string | null;
}

export interface SepayRefundMatchOption {
  id: number;
  amount: number;
  approvedAt: string;
  orderId: number;
  orderNumber: string;
  webhookEventId: number | null;
}

export interface SepayBankTransaction {
  eventId: number;
  requestId: string;
  createdAt: string;
  processingStatus: string;
  errorCode: string | null;
  orderId: number | null;
  orderNumber: string | null;
  paymentId: number | null;
  expenseId: number | null;
  expenseIds: number[];
  supplierPaymentMatches: SepaySupplierPaymentMatch[];
  supplierPaymentMatchConfirmed: boolean;
  refundMatches: SepayRefundMatchOption[];
  refundMatchConfirmed: boolean;
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

export function nextSepayExpenseSelection(
  currentIds: readonly number[],
  expenseId: number,
  persistedIntentIds: ReadonlySet<number>,
): number[] {
  if (currentIds.includes(expenseId)) {
    return currentIds.filter((id) => id !== expenseId);
  }

  if (
    persistedIntentIds.has(expenseId) ||
    currentIds.some((id) => persistedIntentIds.has(id))
  ) {
    return [expenseId];
  }

  return [...currentIds, expenseId];
}

export function isSepayRefundAllocationBalanced(
  transactionAmount: number,
  selectedRefundAmount: number,
  selectedRefundCount: number,
): boolean {
  return (
    selectedRefundCount === 0 || selectedRefundAmount === transactionAmount
  );
}

export type SepayUnmatchedMoneyInReason =
  | "webhook_error"
  | "missing_reference"
  | "unmatched_reference";

export type SepayReconciliationState =
  | "matched"
  | "needs_review"
  | "webhook_error";

const SEPAY_RECOVERABLE_PAYMENT_REVIEW_CODES = [
  "missing_payment_code_needs_review",
  "order_not_found_needs_review",
  "ambiguous_payment_code_needs_review",
  "amount_mismatch_needs_review",
] as const;

const SEPAY_PAYMENT_CONFLICT_REVIEW_CODES = [
  "payment_method_conflict_needs_review",
  "payment_state_conflict_needs_review",
  "overpayment_needs_review",
] as const;

function includesErrorCode(
  values: readonly string[],
  errorCode: string | null,
): boolean {
  return errorCode != null && values.some((value) => value === errorCode);
}

export function isSepayPaymentConflictReviewCode(
  errorCode: string | null,
): boolean {
  return includesErrorCode(SEPAY_PAYMENT_CONFLICT_REVIEW_CODES, errorCode);
}

export function isSepayBusinessReviewCode(errorCode: string | null): boolean {
  return (
    includesErrorCode(SEPAY_RECOVERABLE_PAYMENT_REVIEW_CODES, errorCode) ||
    isSepayPaymentConflictReviewCode(errorCode)
  );
}

export function canManuallyLinkSepayPayment(
  transaction: Pick<
    SepayBankTransaction,
    | "errorCode"
    | "expenseIds"
    | "paymentId"
    | "processingStatus"
    | "transferType"
  >,
): boolean {
  return (
    transaction.transferType === "in" &&
    transaction.processingStatus === "processed" &&
    transaction.paymentId == null &&
    transaction.expenseIds.length === 0 &&
    (transaction.errorCode == null ||
      includesErrorCode(
        SEPAY_RECOVERABLE_PAYMENT_REVIEW_CODES,
        transaction.errorCode,
      ))
  );
}

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
    "code" | "content" | "errorCode" | "processingStatus" | "referenceCode"
  >,
): SepayUnmatchedMoneyInReason {
  if (
    transaction.processingStatus === "failed" ||
    (transaction.errorCode != null &&
      !isSepayBusinessReviewCode(transaction.errorCode))
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
    | "refundMatchConfirmed"
    | "supplierPaymentMatchConfirmed"
    | "supplierPaymentMatches"
    | "transferType"
  >,
): SepayReconciliationState {
  if (
    transaction.processingStatus === "failed" ||
    (transaction.errorCode != null &&
      !isUnclassifiedMoneyOutStatus(transaction) &&
      !isSepayBusinessReviewCode(transaction.errorCode))
  ) {
    return "webhook_error";
  }

  if (
    (transaction.transferType === "in" &&
      (transaction.paymentId != null || transaction.expenseIds.length > 0)) ||
    (transaction.transferType === "out" &&
      (transaction.expenseIds.length > 0 ||
        transaction.supplierPaymentMatchConfirmed ||
        transaction.refundMatchConfirmed))
  ) {
    return "matched";
  }

  return "needs_review";
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
  return getVNDateString(resolveSepayTransactionInstant(transaction));
}

export function resolveSepayTransactionInstant(
  transaction: Pick<SepayBankTransaction, "createdAt" | "transactionDate">,
): string {
  const transactionDate = transaction.transactionDate?.trim();
  const localMatch = transactionDate?.match(SEPAY_LOCAL_DATE_TIME_PATTERN);
  if (localMatch?.[1] && localMatch[2]) {
    return `${localMatch[1]}T${localMatch[2]}+07:00`;
  }
  if (
    transactionDate &&
    EXPLICIT_TIME_ZONE_PATTERN.test(transactionDate) &&
    !Number.isNaN(Date.parse(transactionDate))
  ) {
    return transactionDate;
  }
  return transaction.createdAt;
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

  const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;

  return {
    eventId: row.id,
    requestId: row.request_id,
    createdAt: row.created_at,
    processingStatus: row.processing_status,
    errorCode: row.error_code,
    orderId: row.order_id,
    orderNumber:
      typeof order?.order_number === "string" ? order.order_number : null,
    paymentId: row.payment_id,
    expenseId: row.expense_id,
    expenseIds: row.expense_id != null ? [row.expense_id] : [],
    supplierPaymentMatches: [],
    supplierPaymentMatchConfirmed: false,
    refundMatches: [],
    refundMatchConfirmed: false,
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

function moneyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1;
}

function normalizeRef(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized && normalized.length >= 4 ? normalized : null;
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

function supplierPaymentMatchesTransaction(
  payment: Pick<SepaySupplierPaymentMatch, "referenceNote">,
  transaction: Pick<SepayBankTransaction, "code" | "content" | "referenceCode">,
): boolean {
  const note = normalizeRef(payment.referenceNote);
  if (!note) return false;

  const txRefs = [
    normalizeRef(transaction.referenceCode),
    normalizeRef(transaction.code),
    normalizeRef(transaction.content),
  ].filter((ref): ref is string => ref != null);

  return txRefs.some((ref) => ref.includes(note) || note.includes(ref));
}

export function attachSupplierPaymentMatches(
  transactions: SepayBankTransaction[],
  payments: SepaySupplierPaymentMatch[],
): SepayBankTransaction[] {
  const usedPaymentIds = new Set<number>();

  return transactions.map((transaction) => {
    const confirmedMatches = payments.filter(
      (payment) => payment.webhookEventId === transaction.eventId,
    );
    if (confirmedMatches.length > 0) {
      for (const match of confirmedMatches) usedPaymentIds.add(match.id);
      return {
        ...transaction,
        supplierPaymentMatches: confirmedMatches,
        supplierPaymentMatchConfirmed: true,
      };
    }

    if (
      transaction.transferType !== "out" ||
      transaction.expenseIds.length > 0 ||
      transaction.processingStatus === "failed" ||
      (transaction.errorCode != null &&
        !isUnclassifiedMoneyOutStatus(transaction))
    ) {
      return transaction;
    }

    const businessDate = sepayTransactionBusinessDate(transaction);
    const candidates = payments.filter(
      (payment) =>
        !usedPaymentIds.has(payment.id) &&
        payment.webhookEventId == null &&
        getVNDateString(payment.paymentDate) === businessDate &&
        supplierPaymentMatchesTransaction(payment, transaction),
    );
    if (candidates.length === 0) return transaction;

    const totalAmount = candidates.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    const matches = moneyEqual(totalAmount, transaction.amount)
      ? candidates
      : candidates.filter((payment) =>
          moneyEqual(payment.amount, transaction.amount),
        );

    if (
      matches.length === 0 ||
      (!moneyEqual(totalAmount, transaction.amount) && matches.length !== 1)
    ) {
      return transaction;
    }

    for (const match of matches) usedPaymentIds.add(match.id);

    return {
      ...transaction,
      supplierPaymentMatches: matches,
      supplierPaymentMatchConfirmed: false,
    };
  });
}

export function attachRefundMatches(
  transactions: SepayBankTransaction[],
  refunds: SepayRefundMatchOption[],
): SepayBankTransaction[] {
  return transactions.map((transaction) => {
    const confirmedMatches = refunds.filter(
      (refund) => refund.webhookEventId === transaction.eventId,
    );
    return confirmedMatches.length > 0
      ? {
          ...transaction,
          refundMatches: confirmedMatches,
          refundMatchConfirmed: true,
        }
      : transaction;
  });
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
