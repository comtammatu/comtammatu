import { fetchStocktakeSessions } from "../actions";
import { formatDate } from "../_lib/format";
import { StocktakeClient } from "./stocktake-client";
import type { StocktakeSessionRow } from "./stocktake-client";

export default async function StocktakePage() {
  const res = await fetchStocktakeSessions();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const sessions: StocktakeSessionRow[] = dbRows.map((row) => {
    const totalItems = Number(row.total_items ?? 0);
    const countedItems = Number(row.counted_items ?? 0);
    const progress =
      totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;

    return {
      id: row.id as number,
      code: (row.session_number as string) ?? "",
      branchName:
        ((row.branches as Record<string, unknown>)?.name as string) ?? "—",
      manager: "—",
      status: (row.status as string) ?? "in_progress",
      startDate: row.started_at ? formatDate(row.started_at as string) : "—",
      endDate: row.completed_at ? formatDate(row.completed_at as string) : null,
      progress,
      counted: countedItems,
      total: totalItems,
    };
  });

  return <StocktakeClient sessions={sessions} />;
}
