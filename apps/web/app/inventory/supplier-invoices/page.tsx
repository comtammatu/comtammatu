import { fetchGrns, fetchSupplierInvoices } from "../procurement-actions";
import { fetchSuppliers } from "../supplier-actions";
import { parseBranchIdParam } from "../_lib/inventory-scope";
import { SupplierInvoicesClient } from "./supplier-invoices-client";
import type { SupplierInvoiceRow } from "./supplier-invoices-client";

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchFilter = parseBranchIdParam(params.branchId) ?? undefined;

  const [res, suppliersRes, grnsRes] = await Promise.all([
    fetchSupplierInvoices(branchFilter),
    fetchSuppliers(),
    fetchGrns(branchFilter),
  ]);
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const invoices: SupplierInvoiceRow[] = dbRows.map((row) => ({
    id: row.id as number,
    supplierId: Number(row.supplier_id ?? 0),
    grnId: row.grn_id != null ? Number(row.grn_id) : null,
    code: (row.invoice_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
    grnCode:
      ((row.goods_received_notes as Record<string, unknown>)
        ?.grn_number as string) ?? null,
    matchStatus:
      ((row.matching_status as string | undefined) ??
        (row.match_status as string | undefined) ??
        "pending"),
    paymentStatus: (row.payment_status as string) ?? "unpaid",
    amount: Number(row.total_amount ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    variance: row.variance_pct != null ? Number(row.variance_pct) : null,
    invoiceDate: (row.invoice_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
  }));

  const suppliers = suppliersRes.success
    ? ((suppliersRes.data ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? "—"),
        }),
      )
    : [];

  const grns = grnsRes.success
    ? ((grnsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: Number(row.id ?? 0),
        code: String(row.grn_number ?? "—"),
        supplierId: Number(row.supplier_id ?? 0),
        supplierName: String(
          ((row.suppliers as Record<string, unknown> | null)?.name as string) ??
            "—",
        ),
      }))
    : [];

  return (
    <SupplierInvoicesClient
      invoices={invoices}
      suppliers={suppliers}
      grns={grns}
    />
  );
}
