import { z } from "zod";
import type { JwtClaims } from "@comtammatu/shared/auth";
import {
  getVNBusinessDateString,
  getVNBusinessDayUtcRange,
} from "@comtammatu/shared/time";
import type { loadAuthState } from "@/_lib/auth";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

const paymentMixSchema = z.record(z.string(), z.coerce.number());

export const branchDaySummarySchema = z.object({
  business_date: z.string(),
  day_start: z.string(),
  day_end: z.string(),
  revenue: z.coerce.number(),
  paid_orders: z.coerce.number(),
  unpaid_orders: z.coerce.number(),
  cash_revenue: z.coerce.number(),
  noncash_revenue: z.coerce.number(),
  payment_mix: paymentMixSchema.nullable(),
  closed_session_count: z.coerce.number(),
  open_session_count: z.coerce.number(),
  is_closed: z.boolean(),
  closed_at: z.string().nullable(),
  closed_by_user_id: z.string().nullable(),
  note: z.string().nullable(),
});

export type BranchDaySummary = z.infer<typeof branchDaySummarySchema>;

export interface CloseDaySessionRow {
  id: number;
  terminal_name: string | null;
  opened_by_name: string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
}

export interface CloseDayData {
  summary: BranchDaySummary | null;
  sessions: CloseDaySessionRow[];
  branchName: string;
  businessDate: string;
  pendingWasteCount: number;
  pendingCountSlipsCount: number;
  pendingCheckoutsCount: number;
  loadFailed: boolean;
}

export async function fetchCloseDayData(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
  branchName: string,
): Promise<CloseDayData> {
  const businessDate = getVNBusinessDateString();
  const { startIso, endIso } = getVNBusinessDayUtcRange(businessDate);
  const [
    summaryRes,
    sessionsRes,
    wasteRes,
    countSlipsRes,
    checkoutsRes,
  ] = await Promise.all([
    supabase.rpc("get_branch_day_summary", {
      p_branch_id: branchId,
      p_business_date: businessDate,
    }),
    supabase
      .from("pos_sessions")
      .select(
        "id, terminal_id, opened_by, opened_at, closed_at, status, opening_cash, closing_cash, expected_cash, cash_difference",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .gte("opened_at", startIso)
      .lt("opened_at", endIso)
      .order("opened_at", { ascending: false })
      .limit(50),
    supabase
      .from("stock_issues")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("issue_type", "writeoff")
      .eq("approval_status", "pending"),
    supabase
      .from("inventory_count_slips")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "submitted"),
    supabase.rpc("get_checkout_review_queue", {
      p_branch_id: branchId,
      p_include_rows: false,
    }),
  ]);

  const loadFailed = !!summaryRes.error;
  const summaryParsed = branchDaySummarySchema.safeParse(summaryRes.data);
  const summary = summaryParsed.success ? summaryParsed.data : null;

  const rawSessions = (sessionsRes.data ?? []) as Array<{
    id: number;
    terminal_id: number | null;
    opened_by: string | null;
    opened_at: string;
    closed_at: string | null;
    status: string;
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    cash_difference: number | null;
  }>;
  const terminalIds = Array.from(
    new Set(rawSessions.map((r) => r.terminal_id).filter((v): v is number => v != null)),
  );
  const openerIds = Array.from(
    new Set(rawSessions.map((r) => r.opened_by).filter((v): v is string => v != null)),
  );

  const [terminalsRes, openersRes] = await Promise.all([
    terminalIds.length
      ? supabase
          .from("pos_terminals")
          .select("id, name")
          .in("id", terminalIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }>, error: null }),
    openerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", openerIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null }>,
          error: null,
        }),
  ]);
  const terminalNameById = new Map(
    (terminalsRes.data ?? []).map((t) => [t.id, t.name]),
  );
  const openerNameById = new Map(
    (openersRes.data ?? []).map((p) => [p.id, p.full_name ?? null]),
  );

  const sessions: CloseDaySessionRow[] = rawSessions.map((row) => ({
    id: row.id,
    terminal_name: row.terminal_id ? (terminalNameById.get(row.terminal_id) ?? null) : null,
    opened_by_name: row.opened_by ? (openerNameById.get(row.opened_by) ?? null) : null,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    status: row.status,
    opening_cash: Number(row.opening_cash ?? 0),
    closing_cash: row.closing_cash == null ? null : Number(row.closing_cash),
    expected_cash: row.expected_cash == null ? null : Number(row.expected_cash),
    cash_difference: row.cash_difference == null ? null : Number(row.cash_difference),
  }));

  return {
    summary,
    sessions,
    branchName,
    businessDate,
    pendingWasteCount: wasteRes.count ?? 0,
    pendingCountSlipsCount: countSlipsRes.count ?? 0,
    pendingCheckoutsCount: checkoutsRes.data?.[0]?.pending_count ?? 0,
    loadFailed,
  };
}
