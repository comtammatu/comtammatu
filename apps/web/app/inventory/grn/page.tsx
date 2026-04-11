import { fetchGrns } from "../procurement-actions";
import { formatDate } from "../_lib/format";
import { GrnListClient } from "./grn-list-client";
import type { GrnRow } from "./grn-list-client";

export default async function GRNListPage() {
  const res = await fetchGrns();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const grns: GrnRow[] = dbRows.map((row) => ({
    id: row.id as number,
    code: (row.grn_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
    poCode:
      ((row.purchase_orders as Record<string, unknown>)?.po_number as string) ??
      "—",
    date: row.received_at ? formatDate(row.received_at as string) : "—",
    total: Number(row.total_amount ?? 0),
    status: (row.status as string) ?? "pending",
  }));

  return <GrnListClient grns={grns} />;
}
