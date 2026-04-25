import { redirect } from "next/navigation";
import { ADMIN_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/inventory/_lib/auth";
import { PeriodAdminClient, type PeriodRow } from "./period-admin-client";

export const dynamic = "force-dynamic";

const MONTHS_BACK = 13;

export default async function PeriodsAdminPage() {
  const ctx = await getAuthContextWithPermission(
    ADMIN_ROLES,
    PERMISSION_KEYS.ACCOUNTING_PERIOD_REOPEN,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  // Compute month range: current + previous 12 months
  const now = new Date();
  const range: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    range.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const { data: rows } = await supabase
    .from("accounting_periods")
    .select("year, month, soft_closed_at, hard_closed_at")
    .eq("tenant_id", claims.tenant_id)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const key = (y: number, m: number) => `${y}-${m}`;
  const existing = new Map<string, { soft: string | null; hard: string | null }>();
  for (const r of rows ?? []) {
    existing.set(key(r.year, r.month), {
      soft: r.soft_closed_at,
      hard: r.hard_closed_at,
    });
  }

  const periods: PeriodRow[] = range.map((r) => {
    const hit = existing.get(key(r.year, r.month));
    return {
      year: r.year,
      month: r.month,
      softClosedAt: hit?.soft ?? null,
      hardClosedAt: hit?.hard ?? null,
    };
  });

  return <PeriodAdminClient initial={periods} />;
}
