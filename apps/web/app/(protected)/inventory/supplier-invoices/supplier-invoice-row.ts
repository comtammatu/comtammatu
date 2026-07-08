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
  amount: number;
  paidAmount: number;
  variance: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
};

export function mapSupplierInvoiceRow(
  row: Record<string, unknown>,
): SupplierInvoiceRow {
  const grnId = row.grn_id != null ? Number(row.grn_id) : null;
  const poId = row.po_id != null ? Number(row.po_id) : null;
  const rawMatchStatus =
    (row.matching_status as string | undefined) ??
    (row.match_status as string | undefined) ??
    "pending";

  return {
    id: row.id as number,
    supplierId: Number(row.supplier_id ?? 0),
    grnId,
    poId,
    code: (row.invoice_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "\u2014",
    grnCode:
      ((row.goods_received_notes as Record<string, unknown>)
        ?.grn_number as string) ?? null,
    poCode:
      ((row.purchase_orders as Record<string, unknown>)?.po_number as string) ??
      null,
    matchStatus:
      rawMatchStatus === "matched" && grnId == null
        ? "pending"
        : rawMatchStatus,
    paymentStatus: (row.payment_status as string) ?? "unpaid",
    amount: Number(row.total_amount ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    variance:
      (row.variance_pct as number | null | undefined) != null
        ? Number(row.variance_pct)
        : null,
    invoiceDate: (row.invoice_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
  };
}
