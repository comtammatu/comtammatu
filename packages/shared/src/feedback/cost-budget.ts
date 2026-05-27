/**
 * Monthly LLM spend gate for a tenant.
 *
 * v1 pragmatic: sums feedback_daily_reports.llm_cost_usd only (Tầng 2 costs).
 * Tầng 1 (per-enrichment) costs are typically <10% of Tầng 2 in production.
 * Slice 3 should add per-feedback cost column for accurate accounting.
 */
/** Minimal duck-type for the Supabase query builder used here. */
interface QueryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export type CostBudgetCheck = {
  ok: boolean; // true = under budget, may proceed
  spent_usd: number;
  budget_usd: number;
  reason?: "over_budget";
};

export async function checkMonthlyBudget(args: {
  supabase: QueryClient;
  tenant_id: number;
}): Promise<CostBudgetCheck> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const { data: settings } = await args.supabase
    .from("feedback_settings")
    .select("ai_monthly_budget_usd")
    .eq("tenant_id", args.tenant_id)
    .maybeSingle();

  const budget: number = settings?.ai_monthly_budget_usd ?? 50;

  const { data: reports } = await args.supabase
    .from("feedback_daily_reports")
    .select("llm_cost_usd")
    .eq("tenant_id", args.tenant_id)
    .gte("generated_at", monthStart);

  const spent = (reports ?? []).reduce(
    (sum: number, r: { llm_cost_usd: number | null }) =>
      sum + (Number(r.llm_cost_usd) || 0),
    0,
  );

  if (spent >= budget) {
    return {
      ok: false,
      spent_usd: spent,
      budget_usd: budget,
      reason: "over_budget",
    };
  }
  return { ok: true, spent_usd: spent, budget_usd: budget };
}
