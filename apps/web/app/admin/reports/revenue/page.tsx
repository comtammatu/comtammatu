import { createClient } from "@comtammatu/database/supabase/server";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  fetchRevenueRollup,
  type RevenueGranularity,
} from "../../../finance/actions";
import { RevenueReportClient } from "./revenue-report-client";

const VALID_GRANULARITIES: readonly RevenueGranularity[] = [
  "day",
  "week",
  "month",
] as const;

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    granularity?: string;
    start?: string;
    end?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: defaultBranch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("branch_kind", "branch")
    .eq("is_active", true)
    .order("id")
    .limit(1)
    .maybeSingle();

  const branchId = defaultBranch?.id ?? 0;

  const granularity = (
    VALID_GRANULARITIES.includes(sp.granularity as RevenueGranularity)
      ? sp.granularity
      : "day"
  ) as RevenueGranularity;

  // Default range tuỳ granularity: day → 30d, week → 12w, month → 12m.
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = (() => {
    const d = new Date(today);
    if (granularity === "day") d.setDate(d.getDate() - 29);
    else if (granularity === "week") d.setDate(d.getDate() - 7 * 12);
    else d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  })();

  const startDate = isValidIsoDate(sp.start) ? sp.start : defaultStart;
  const endDate = isValidIsoDate(sp.end) ? sp.end : defaultEnd;

  const result =
    branchId > 0
      ? await fetchRevenueRollup(branchId, startDate, endDate, granularity)
      : { success: true as const, data: [] };

  const rows = result.success ? ((result.data ?? []) as RollupRow[]) : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {APP_COPY_VI.executiveReporting}
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Báo cáo doanh thu
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <RevenueReportClient
        initialRows={rows}
        initialBranchId={branchId}
        initialStart={startDate}
        initialEnd={endDate}
        initialGranularity={granularity}
      />
    </div>
  );
}

function isValidIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export interface RollupRow {
  period_start: string;
  period_end: string;
  period_label: string;
  order_count: number;
  total_revenue: number | null;
  total_tax: number | null;
  cash_revenue: number | null;
  vietqr_revenue: number | null;
  momo_revenue: number | null;
}
