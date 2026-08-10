import { createClient } from "@comtammatu/database/supabase/server";

/**
 * Failed/expired print jobs in the last 24h (tenant-wide).
 * Mirrors the needs_attention KPI on /settings/printers/jobs.
 */
export async function countPrintJobsNeedingAttention(): Promise<number> {
  const supabase = await createClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["failed", "expired"])
    .gte("created_at", since24h);
  return error ? 0 : (count ?? 0);
}
