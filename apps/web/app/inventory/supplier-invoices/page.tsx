import { fetchSupplierInvoices } from "../procurement-actions";
import { SupplierInvoicesClient } from "./supplier-invoices-client";
import type { SupplierInvoiceRow } from "./supplier-invoices-client";

export default async function SupplierInvoicesPage() {
  const res = await fetchSupplierInvoices();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const invoices: SupplierInvoiceRow[] = dbRows.map((row) => ({
    id: row.id as number,
    code: (row.invoice_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
    grnCode:
      ((row.goods_received_notes as Record<string, unknown>)?.grn_number as string) ??
      null,
    matchStatus: (row.match_status as string) ?? "pending",
    paymentStatus: (row.payment_status as string) ?? "unpaid",
    amount: Number(row.total_amount ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    variance: row.variance_pct != null ? Number(row.variance_pct) : null,
    invoiceDate: (row.invoice_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
  }));

  return <SupplierInvoicesClient invoices={invoices} />;
}
