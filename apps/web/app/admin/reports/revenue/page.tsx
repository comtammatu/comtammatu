import { createClient } from "@comtammatu/database/supabase/server";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { fetchDailyRevenue } from "../../../finance/actions";
import { RevenueReportClient } from "./revenue-report-client";

export default async function RevenueReportPage() {
  const supabase = await createClient();

  const { data: hqBranch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_headquarters", true)
    .maybeSingle();

  const branchId = hqBranch?.id ?? 0;

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const result =
    branchId > 0
      ? await fetchDailyRevenue(branchId, startDate, endDate)
      : { success: true as const, data: [] };

  const rows = result.success ? ((result.data ?? []) as DailyRevenueRow[]) : [];

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
      />
    </div>
  );
}

export interface DailyRevenueRow {
  date: string;
  branch_id: number;
  tenant_id: number;
  order_count: number;
  total_revenue: number | null;
  total_tax: number | null;
  cash_revenue: number | null;
  vietqr_revenue: number | null;
  momo_revenue: number | null;
}
