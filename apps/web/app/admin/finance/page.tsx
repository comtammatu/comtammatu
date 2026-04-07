import { createClient } from "@comtammatu/database/supabase/server";
import { fetchDailyRevenue, fetchTaxInvoices, fetchTopItems } from "./actions";
import { FinanceClient } from "./finance-client";

export default async function FinancePage() {
  const supabase = await createClient();

  // Fetch the headquarters branch to use as default scope for revenue queries.
  // owner/super_manager have branch_id=null in JWT, so we resolve HQ here.
  const { data: hqBranch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_headquarters", true)
    .maybeSingle();

  const branchId = hqBranch?.id ?? 0;

  // Compute 30-day date range
  const endDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tài chính</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Doanh thu và hóa đơn điện tử
        </p>
      </div>

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
