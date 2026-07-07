export type SepayTransferType = "in" | "out";

export interface SepayWebhookRow {
  id: number;
  request_id: string;
  created_at: string;
  processing_status: string;
  error_code: string | null;
  payment_id: number | null;
  expense_id: number | null;
  payload: unknown;
}

export interface SepayBankTransaction {
  eventId: number;
  requestId: string;
  createdAt: string;
  processingStatus: string;
  errorCode: string | null;
  paymentId: number | null;
  expenseId: number | null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
  const raw = transaction.transactionDate ?? transaction.createdAt;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? transaction.createdAt.slice(0, 10);
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
    paymentId: row.payment_id,
    expenseId: row.expense_id,
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
