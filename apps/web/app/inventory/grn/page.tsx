import { fetchGrns } from "../procurement-actions";
import { formatDate } from "../_lib/format";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import { GrnListClient } from "./grn-list-client";
import type { GrnRow } from "./grn-list-client";

const STATUS_FILTER_VALUES = new Set([
  "draft",
  "confirmed",
  "cancelled",
  "partially_received",
  "received",
]);

function parseStatusFilter(
  value: string | string[] | undefined,
): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return STATUS_FILTER_VALUES.has(raw) ? raw : null;
}

function parsePriceReview(value: string | string[] | undefined): boolean {
  if (!value) return false;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

/**
 * Pick the variance with the largest absolute magnitude across the line
 * items, preserving the sign so the row badge can render direction.
 * Returns null when no item has a populated `baseline_variance_pct`
 * (sample_n < 3 or baseline paused — see migration s2-a).
 */
function pickSignedMaxVariance(
  items: ReadonlyArray<{ baseline_variance_pct?: number | null }>,
): number | null {
  let pick: number | null = null;
  for (const item of items) {
    const value = item.baseline_variance_pct;
    if (value == null) continue;
    if (pick == null || Math.abs(value) > Math.abs(pick)) {
      pick = value;
    }
  }
  return pick;
}

export default async function GRNListPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    filter?: string | string[];
    priceReview?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branchId);
  const initialStatusFilter = parseStatusFilter(params.filter);
  const initialPriceReviewFilter = parsePriceReview(params.priceReview);

  const res = await fetchGrns(branchId ?? undefined);
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const grns: GrnRow[] = dbRows.map((row) => {
    const items =
      (row.grn_items as
        | Array<{
            total_cost: number | null;
            baseline_variance_pct: number | null;
          }>
        | null) ?? [];
    const signedMaxVariancePct = pickSignedMaxVariance(items);
    return {
      id: row.id as number,
      code: (row.grn_number as string) ?? "",
      supplierName:
        ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
      poCode:
        ((row.purchase_orders as Record<string, unknown>)
          ?.po_number as string) ?? "—",
      date: row.received_date ? formatDate(row.received_date as string) : "—",
      total: items.reduce((sum, item) => sum + Number(item.total_cost ?? 0), 0),
      status: (row.status as string) ?? "pending",
      signedMaxVariancePct,
      maxAbsVariancePct:
        signedMaxVariancePct == null ? null : Math.abs(signedMaxVariancePct),
    };
  });

  return (
    <GrnListClient
      grns={grns}
      initialStatusFilter={initialStatusFilter}
      initialPriceReviewFilter={initialPriceReviewFilter}
    />
  );
}
