import {
  fetchGrns,
  fetchSupplierInvoices,
  fetchSuppliers,
} from "../procurement-actions";
import { SupplierInvoicesClient } from "./supplier-invoices-client";
import type { SupplierInvoiceRow } from "./supplier-invoices-client";
import type { SupplierRow } from "../suppliers/suppliers-client";
import type { GrnListRow } from "../grn/grn-list-client";

export default async function SupplierInvoicesPage() {
  const [invRes, supRes, grnRes] = await Promise.all([
    fetchSupplierInvoices(),
    fetchSuppliers(),
    fetchGrns(),
  ]);
  const rows: SupplierInvoiceRow[] = invRes.success
    ? ((invRes.data ?? []) as SupplierInvoiceRow[])
    : [];
  const suppliers: SupplierRow[] = supRes.success
    ? ((supRes.data ?? []) as SupplierRow[])
    : [];
  const grns: GrnListRow[] = grnRes.success
    ? ((grnRes.data ?? []) as GrnListRow[])
    : [];

  return (
    <SupplierInvoicesClient initial={rows} suppliers={suppliers} grns={grns} />
  );
}
