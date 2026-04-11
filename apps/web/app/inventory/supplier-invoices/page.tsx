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
    poCode:
      ((row.purchase_orders as Record<string, unknown>)?.po_number as string) ??
      "—",
    grnCode:
      ((row.grns as Record<string, unknown>)?.grn_number as string) ?? null,
    matchStatus: (row.match_status as string) ?? "pending",
    paymentStatus: (row.payment_status as string) ?? "unpaid",
    amount: Number(row.total_amount ?? 0),
    variance: row.variance_pct != null ? Number(row.variance_pct) : null,
  }));

  return <SupplierInvoicesClient invoices={invoices} />;
}
