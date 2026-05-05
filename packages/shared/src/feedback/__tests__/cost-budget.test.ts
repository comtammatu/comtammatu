import test from "node:test";
import assert from "node:assert/strict";
import { checkMonthlyBudget } from "../cost-budget";

function makeSupabase(opts: {
  settings: { ai_monthly_budget_usd: number } | null;
  reports: { llm_cost_usd: number | null }[];
}) {
  return {
    from(table: string) {
      if (table === "feedback_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.settings }),
            }),
          }),
        };
      }
      // feedback_daily_reports: .select().eq().gte()
      return {
        select: () => ({
          eq: () => ({
            gte: async () => ({ data: opts.reports }),
          }),
        }),
      };
    },
  };
}

test("ok=true when under budget", async () => {
  const supabase = makeSupabase({
    settings: { ai_monthly_budget_usd: 50 },
    reports: [{ llm_cost_usd: 10 }, { llm_cost_usd: 5 }],
  });
  const result = await checkMonthlyBudget({ supabase, tenant_id: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.spent_usd, 15);
  assert.equal(result.budget_usd, 50);
  assert.equal(result.reason, undefined);
});

test("ok=false when over budget", async () => {
  const supabase = makeSupabase({
    settings: { ai_monthly_budget_usd: 20 },
    reports: [{ llm_cost_usd: 15 }, { llm_cost_usd: 10 }],
  });
  const result = await checkMonthlyBudget({ supabase, tenant_id: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.spent_usd, 25);
  assert.equal(result.budget_usd, 20);
  assert.equal(result.reason, "over_budget");
});

test("ok=false when exactly at budget", async () => {
  const supabase = makeSupabase({
    settings: { ai_monthly_budget_usd: 30 },
    reports: [{ llm_cost_usd: 30 }],
  });
  const result = await checkMonthlyBudget({ supabase, tenant_id: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "over_budget");
});

test("default budget=50 when settings missing", async () => {
  const supabase = makeSupabase({
    settings: null,
    reports: [{ llm_cost_usd: 10 }],
  });
  const result = await checkMonthlyBudget({ supabase, tenant_id: 1 });
  assert.equal(result.budget_usd, 50);
  assert.equal(result.ok, true);
});

test("handles null llm_cost_usd entries gracefully", async () => {
  const supabase = makeSupabase({
    settings: { ai_monthly_budget_usd: 50 },
    reports: [{ llm_cost_usd: null }, { llm_cost_usd: 5 }],
  });
  const result = await checkMonthlyBudget({ supabase, tenant_id: 1 });
  assert.equal(result.spent_usd, 5);
  assert.equal(result.ok, true);
});
