import { redirect } from "next/navigation";
import { ADMIN_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNMonthSequenceBack } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "@/_lib/auth";
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

  const range = getVNMonthSequenceBack(MONTHS_BACK);

  const { data: rows } = await supabase
    .from("accounting_periods")
    .select("year, month, soft_closed_at, hard_closed_at")
    .eq("tenant_id", claims.tenant_id)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const key = (y: number, m: number) => `${y}-${m}`;
  const existing = new Map<
    string,
    { soft: string | null; hard: string | null }
  >();
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

  // Thread permission flag to client — rule UI-PERMISSION-FLAGS-THREADED-NOT-SERVER-ONLY.
  // ctx is non-null here (page redirected above if missing permission), so canCloseOrReopen = true.
  return (
    <PeriodAdminClient initial={periods} canCloseOrReopen={Boolean(ctx)} />
  );
}
