export type SupplierInvoiceRow = {
  id: number;
  supplierId: number;
  grnId: number | null;
  poId: number | null;
  code: string;
  supplierName: string;
  grnCode: string | null;
  poCode: string | null;
  matchStatus: string;
  paymentStatus: string;
  subtotal: number;
  vatAmount: number;
  vatBreakdown: SupplierInvoiceVatBreakdownLine[];
  amount: number;
  paidAmount: number;
  creditAppliedAmount: number;
  variance: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  vatInvoiceAttachmentPath: string | null;
  paymentCount: number;
  lastPayment: SupplierInvoicePaymentSummary | null;
};

export type SupplierInvoiceVatBreakdownLine = {
  vatRate: number;
  taxableAmount: number;
  vatAmount: number;
};

export type SupplierInvoicePaymentSummary = {
  id: number;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  referenceNote: string | null;
};

export function getSupplierInvoiceOutstandingAmount(
  invoice: Pick<
    SupplierInvoiceRow,
    "amount" | "paidAmount" | "creditAppliedAmount"
  >,
) {
  return Math.max(
    invoice.amount - invoice.paidAmount - invoice.creditAppliedAmount,
    0,
  );
}

export function getSupplierInvoiceEffectivePaymentStatus(
  invoice: Pick<
    SupplierInvoiceRow,
    "amount" | "paidAmount" | "creditAppliedAmount"
  >,
) {
  const settledAmount = invoice.paidAmount + invoice.creditAppliedAmount;
  if (settledAmount >= invoice.amount) return "paid";
  return settledAmount > 0 ? "partial" : "unpaid";
}

export function resolveSupplierPaymentIntentKey(
  currentKey: string | null,
  createKey: () => string,
) {
  return currentKey ?? createKey();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getSupplierPayments(row: Record<string, unknown>) {
  const raw = row.supplier_payments;
  const direct = Array.isArray(raw)
    ? raw.filter(isRecord)
    : isRecord(raw)
      ? [raw]
      : [];
  const allocated = Array.isArray(row.supplier_payment_allocations)
    ? row.supplier_payment_allocations.flatMap((allocation) => {
        if (!isRecord(allocation)) return [];
        const payment = allocation.supplier_payments;
        if (Array.isArray(payment)) return payment.filter(isRecord);
        return isRecord(payment) ? [payment] : [];
      })
    : [];
  return [...new Map([...direct, ...allocated].map((item) => [item.id, item])).values()];
}

function mapSupplierPayment(
  row: Record<string, unknown>,
): SupplierInvoicePaymentSummary {
  return {
    id: Number(row.id ?? 0),
    amount: Number(row.amount ?? 0),
    paymentMethod: String(row.payment_method ?? ""),
    paymentDate: String(row.payment_date ?? ""),
    referenceNote:
      typeof row.reference_note === "string" && row.reference_note.trim()
        ? row.reference_note
        : null,
  };
}

function getSupplierInvoiceVatBreakdown(
  row: Record<string, unknown>,
): SupplierInvoiceVatBreakdownLine[] {
  const raw = row.vat_breakdown;
  const lines = Array.isArray(raw)
    ? raw
        .filter(isRecord)
        .map((line) => ({
          vatRate: Number(line.vat_rate),
          taxableAmount: Number(line.taxable_amount),
          vatAmount: Number(line.vat_amount),
        }))
        .filter(
          (line) =>
            [0, 5, 8, 10].includes(line.vatRate) &&
            line.taxableAmount > 0 &&
            line.vatAmount >= 0,
        )
        .sort((left, right) => left.vatRate - right.vatRate)
    : [];

  if (lines.length > 0) return lines;

  return [
    {
      vatRate: Number(row.vat_rate ?? 0),
      taxableAmount: Number(row.subtotal ?? 0),
      vatAmount: Number(row.vat_amount ?? 0),
    },
  ];
}

export function mapSupplierInvoiceRow(
  row: Record<string, unknown>,
): SupplierInvoiceRow {
  const grnId = row.grn_id != null ? Number(row.grn_id) : null;
  const poId = row.po_id != null ? Number(row.po_id) : null;
  const rawMatchStatus =
    (row.matching_status as string | undefined) ??
    (row.match_status as string | undefined) ??
    "pending";
  const amount = Number(row.total_amount ?? 0);
  const paidAmount = Number(row.paid_amount ?? 0);
  const creditAppliedAmount = Number(row.credit_applied_amount ?? 0);
  const payments = getSupplierPayments(row)
    .map(mapSupplierPayment)
    .sort((left, right) => {
      const dateDiff = right.paymentDate.localeCompare(left.paymentDate);
      return dateDiff !== 0 ? dateDiff : right.id - left.id;
    });

  const allocatedReceipts = Array.isArray(
    row.supplier_invoice_receipt_allocations,
  )
    ? row.supplier_invoice_receipt_allocations.flatMap((allocation) => {
        if (!isRecord(allocation)) return [];
        const receipt = allocation.goods_received_notes;
        const resolved = Array.isArray(receipt) ? receipt[0] : receipt;
        return isRecord(resolved) ? [resolved] : [];
      })
    : [];
  const allocatedReceiptCodes = allocatedReceipts
    .map((receipt) => String(receipt.grn_number ?? ""))
    .filter(Boolean);
  const headerReceiptCode =
    ((row.goods_received_notes as Record<string, unknown>)
      ?.grn_number as string) ?? null;
  return {
    id: row.id as number,
    supplierId: Number(row.supplier_id ?? 0),
    grnId,
    poId,
    code: (row.invoice_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "\u2014",
    grnCode:
      allocatedReceiptCodes.length > 1
        ? `${allocatedReceiptCodes[0]} +${allocatedReceiptCodes.length - 1}`
        : (allocatedReceiptCodes[0] ?? headerReceiptCode),
    poCode:
      ((row.purchase_orders as Record<string, unknown>)?.po_number as string) ??
      null,
    matchStatus:
      rawMatchStatus === "matched" && grnId == null
        ? "pending"
        : rawMatchStatus,
    paymentStatus: getSupplierInvoiceEffectivePaymentStatus({
      amount,
      paidAmount,
      creditAppliedAmount,
    }),
    subtotal: Number(row.subtotal ?? 0),
    vatAmount: Number(row.vat_amount ?? 0),
    vatBreakdown: getSupplierInvoiceVatBreakdown(row),
    amount,
    paidAmount,
    creditAppliedAmount,
    variance:
      (row.variance_pct as number | null | undefined) != null
        ? Number(row.variance_pct)
        : null,
    invoiceDate: (row.invoice_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    vatInvoiceAttachmentPath:
      typeof row.vat_invoice_attachment_path === "string" &&
      row.vat_invoice_attachment_path.trim()
        ? row.vat_invoice_attachment_path.trim()
        : null,
    paymentCount: payments.length,
    lastPayment: payments[0] ?? null,
  };
}
