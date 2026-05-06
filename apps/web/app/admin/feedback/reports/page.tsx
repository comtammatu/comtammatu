import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { loadAuthState } from "@/_lib/auth";
import { ReportsList } from "./_components/reports-list";
import type { DailyReportRow } from "@comtammatu/shared/feedback";

interface ReportsPageProps {
  searchParams: Promise<{
    branch_id?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function FeedbackReportsPage({
  searchParams,
}: ReportsPageProps) {
  const params = await searchParams;
  const { claims } = await loadAuthState();

  // feedback:view_report permission is enforced via RLS on feedback_daily_reports.
  // We still gate the page for owner/manager roles.
  if (claims.user_role !== "owner" && claims.user_role !== "super_manager") {
    redirect("/admin/feedback");
  }

  const supabase = await createClient();

  let query = supabase
    .from("feedback_daily_reports")
    .select("id, tenant_id, branch_id, report_date, feedback_count, avg_rating, report_md, metrics_json, llm_model, llm_cost_usd, generated_at")
    .eq("tenant_id", claims.tenant_id)
    .order("report_date", { ascending: false })
    .order("branch_id", { ascending: true })
    .limit(100);

  if (params.branch_id) {
    const bid = Number(params.branch_id);
    if (!isNaN(bid)) {
      query = query.eq("branch_id", bid);
    }
  }
  if (params.from) {
    query = query.gte("report_date", params.from);
  }
  if (params.to) {
    query = query.lte("report_date", params.to);
  }

  const { data: rawReports } = await query;

  // Enrich with branch names
  const branchIds = [
    ...new Set(
      (rawReports ?? [])
        .map((r) => r.branch_id)
        .filter((id): id is number => id !== null),
    ),
  ];
  const { data: branches } =
    branchIds.length > 0
      ? await supabase
          .from("branches")
          .select("id, name")
          .in("id", branchIds)
      : { data: [] };

  const branchNameById = new Map(
    (branches ?? []).map((b) => [b.id, b.name]),
  );

  const reports: DailyReportRow[] = (rawReports ?? []).map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    branch_id: r.branch_id,
    report_date: r.report_date,
    feedback_count: r.feedback_count,
    avg_rating: r.avg_rating,
    report_md: r.report_md,
    metrics_json: r.metrics_json as Record<string, unknown>,
    llm_model: r.llm_model,
    llm_cost_usd: r.llm_cost_usd,
    generated_at: r.generated_at,
    branch_name:
      r.branch_id !== null ? (branchNameById.get(r.branch_id) ?? null) : null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Báo cáo AI hàng ngày</h1>
      <ReportsList reports={reports} />
    </div>
  );
}
