import { fetchStockTransfers } from "../transfer-actions";
import { formatDate } from "../_lib/format";
import { TransfersClient } from "./transfers-client";
import type { TransferRow } from "./transfers-client";

export default async function TransfersPage() {
  const res = await fetchStockTransfers();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const transfers: TransferRow[] = dbRows.map((row) => ({
    id: row.id as number,
    code: (row.transfer_number as string) ?? "",
    fromBranch: (row.from_branch_name as string) ?? "—",
    toBranch: (row.to_branch_name as string) ?? "—",
    status: (row.status as string) ?? "draft",
    date: row.created_at ? formatDate(row.created_at as string) : "—",
  }));

  return <TransfersClient transfers={transfers} />;
}
