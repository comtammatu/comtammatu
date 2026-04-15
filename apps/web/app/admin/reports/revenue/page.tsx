import { createClient } from "@comtammatu/database/supabase/server";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  PageContainer,
  PageHeader,
} from "@comtammatu/ui/components/admin-patterns";
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
    <PageContainer>
      <PageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title="Báo cáo doanh thu"
      />
      <RevenueReportClient
        initialRows={rows}
        initialBranchId={branchId}
        initialStart={startDate}
        initialEnd={endDate}
      />
    </PageContainer>
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
