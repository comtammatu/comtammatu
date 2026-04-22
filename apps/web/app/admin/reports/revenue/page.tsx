import { Suspense } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { fetchDailyRevenue } from "../../../finance/actions";
import { RevenueReportClient } from "./revenue-report-client";
import { BranchSelect } from "@/_components/branch-select";
import type { BranchOption } from "@/_components/branch-select";

interface RevenueReportPageProps {
  searchParams: Promise<{ branchId?: string }>;
}

export default async function RevenueReportPage({
  searchParams,
}: RevenueReportPageProps) {
  const { claims } = await loadAuthState();
  const supabase = await createClient();
  const params = await searchParams;

  // Fetch active operational branches
  const { data: branchRows } = await supabase
    .from("branches")
    .select("id, name")
    .eq("branch_kind", "branch")
    .eq("is_active", true)
    .order("name");

  const branches: BranchOption[] = (branchRows ?? []).map((b) => ({
    id: b.id,
    name: b.name,
  }));

  // branch_manager is locked to their JWT branch_id
  const isBranchScoped = claims.user_role === "branch_manager";

  let branchId: number;
  if (isBranchScoped && claims.branch_id !== null) {
    branchId = claims.branch_id;
  } else if (params.branchId) {
    const parsed = parseInt(params.branchId, 10);
    branchId = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } else {
    // Default: first active operational branch
    branchId = branches[0]?.id ?? 0;
  }

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

      {branches.length > 0 && (
        <div className="flex items-center px-1">
          <Suspense>
            <BranchSelect
              branches={branches}
              selectedBranchId={branchId}
              locked={isBranchScoped}
            />
          </Suspense>
        </div>
      )}

      {branches.length === 0 && (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Không có chi nhánh hoạt động nào. Vui lòng kiểm tra cấu hình hệ thống.
        </div>
      )}

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
