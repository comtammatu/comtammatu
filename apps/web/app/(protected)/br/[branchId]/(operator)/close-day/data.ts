import type { JwtClaims } from "@comtammatu/shared/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import type { loadAuthState } from "@/_lib/auth";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

export interface BranchDaySummary {
  business_date: string;
  day_start: string;
  day_end: string;
  revenue: number;
  paid_orders: number;
  unpaid_orders: number;
  cash_revenue: number;
  noncash_revenue: number;
  payment_mix: Record<string, number> | null;
  closed_session_count: number;
  open_session_count: number;
  is_closed: boolean;
  closed_at: string | null;
  closed_by_user_id: string | null;
  note: string | null;
}

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
  loadFailed: boolean;
}

type SummaryRpcClient = {
  rpc: (
    fn: "get_branch_day_summary",
    args: { p_branch_id: number; p_business_date: string },
  ) => PromiseLike<{
    data: BranchDaySummary | null;
    error: { message?: string } | null;
  }>;
};

/**
 * Loads the branch-day summary (read RPC) plus today's POS sessions for the
 * cash-reconciliation step. The summary RPC gates on settings:branch OR
 * finance:view; the route already restricts to branch_manager/owner.
 */
export async function fetchCloseDayData(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
  branchName: string,
): Promise<CloseDayData> {
  const businessDate = getVNDateString();
  const [summaryRes, sessionsRes] = await Promise.all([
    (supabase as unknown as SummaryRpcClient).rpc("get_branch_day_summary", {
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
      .order("opened_at", { ascending: false })
      .limit(50),
  ]);

  const loadFailed = !!summaryRes.error;
  const summary = summaryRes.data ?? null;

  // Resolve denormalized display fields (terminal name, opener name) without
  // N+1 — fetch the distinct ids then bulk-resolve.
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
    loadFailed,
  };
}
