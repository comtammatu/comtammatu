import { createClient } from "@comtammatu/database/supabase/server";
import { fetchDailyRevenue } from "../../finance/actions";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Báo cáo doanh thu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Doanh thu theo ngày — chi nhánh tổng hợp
        </p>
      </div>
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
