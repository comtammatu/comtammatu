import { Suspense } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { loadAuthState } from "@/_lib/auth";
import { FinanceClient } from "./finance-client";
import { fetchDailyRevenue, fetchTaxInvoices, fetchTopItems } from "./actions";
import { BranchSelect } from "@/_components/branch-select";
import type { BranchOption } from "@/_components/branch-select";

interface FinancePageProps {
  searchParams: Promise<{ branchId?: string }>;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
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

  // Compute 30-day date range
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // periodStart for mv_top_items — first day of current month
  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [dailyRevenueRes, topItemsRes, invoicesRes] = await Promise.all([
    branchId > 0
      ? fetchDailyRevenue(branchId, startDate, endDate)
      : Promise.resolve({ success: true as const, data: [] }),
    branchId > 0
      ? fetchTopItems(branchId, periodStart)
      : Promise.resolve({ success: true as const, data: [] }),
    fetchTaxInvoices(),
  ]);

  const dailyRevenue = dailyRevenueRes.success
    ? ((dailyRevenueRes.data ?? []) as DailyRevenueRow[])
    : [];
  const topItems = topItemsRes.success
    ? ((topItemsRes.data ?? []) as TopItemRow[])
    : [];
  const invoices = invoicesRes.success
    ? ((invoicesRes.data ?? []) as InvoiceRow[])
    : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Kế toán
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Tài chính
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

      <FinanceClient
        dailyRevenue={dailyRevenue}
        topItems={topItems}
        invoices={invoices}
      />
    </div>
  );
}

// ─── Shared row types (used by all client components) ─────────────────────────

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

export interface TopItemRow {
  period_start: string;
  period_end: string;
  branch_id: number;
  tenant_id: number;
  menu_item_id: number;
  item_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface InvoiceRow {
  id: number;
  invoice_number: string | null;
  status: string;
  buyer_name: string | null;
  buyer_tax_code: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  orders: { order_number: string } | null;
}
