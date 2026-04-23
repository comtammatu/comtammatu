import { fetchGrns } from "../procurement-actions";
import { formatDate } from "../_lib/format";
import { parseBranchIdParam } from "../_lib/inventory-scope";
import { GrnListClient } from "./grn-list-client";
import type { GrnRow } from "./grn-list-client";

export default async function GRNListPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchId = parseBranchIdParam(params.branchId);
  const res = await fetchGrns(branchId ?? undefined);
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
    date: row.received_date ? formatDate(row.received_date as string) : "—",
    total: ((row.grn_items as Array<{ total_cost: number }>) ?? []).reduce(
      (sum, item) => sum + Number(item.total_cost ?? 0),
      0,
    ),
    status: (row.status as string) ?? "pending",
  }));

  return <GrnListClient grns={grns} />;
}
