import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { JwtClaims } from "@comtammatu/shared/auth";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import type { loadAuthState } from "@/_lib/auth";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

// Mirrors PrinterStatusBadge: an agent is online when its heartbeat is
// younger than this threshold.
const AGENT_OFFLINE_THRESHOLD_MS = 60_000;

const OPEN_KITCHEN_ORDER_STATES = ["pending", "preparing", "ready"] as const;

export interface BranchDayStatus {
  todayRevenue: number;
  paidOrders: number;
  tablesTotal: number;
  tablesOccupied: number;
  kitchenActiveOrders: number;
  posSessionOpenedAt: string | null;
  printerHasAgent: boolean;
  printerOnline: boolean;
  printerFailed24h: number;
  pendingCheckouts: number;
}

/**
 * Read-only day status for the Branch Command landing. Every metric is
 * fail-soft: a query error degrades that metric to 0/null instead of
 * blocking the page.
 *
 * RLS-backed user-client reads cover payments/orders/tables/print surfaces.
 * pos_sessions (policy keyed on `pos:use`) and the checkout-approval queue
 * go through the service client with explicit tenant+branch filters; the
 * route already gates module ACL + branch match before this runs.
 */
export async function fetchBranchDayStatus(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
): Promise<BranchDayStatus> {
  const todayRange = getVNDayUtcRange(getVNDateString());
  const failedSinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString();
  const service = createServiceClient();

  const [
    paymentsRes,
    tablesRes,
    kitchenRes,
    agentRes,
    failedRes,
    sessionRes,
    checkoutRes,
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, orders!inner(status)")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "completed")
      .not("paid_at", "is", null)
      .neq("orders.status", "cancelled")
      .gte("paid_at", todayRange.startIso)
      .lt("paid_at", todayRange.endIso),
    supabase
      .from("tables")
      .select("status")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .neq("status", "maintenance"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .in("status", [...OPEN_KITCHEN_ORDER_STATES])
      .gte("created_at", todayRange.startIso)
      .lt("created_at", todayRange.endIso),
    supabase
      .from("printer_agent_status")
      .select("agent_id, last_seen_at")
      .eq("branch_id", branchId)
      .maybeSingle(),
    supabase
      .from("print_jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .in("status", ["failed", "expired"])
      .gte("created_at", failedSinceIso),
    service
      .from("pos_sessions")
      .select("opened_at")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "open")
      .maybeSingle(),
    service
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .is("check_out", null)
      .not("checkout_requested_at", "is", null),
  ]);

  const paymentRows = paymentsRes.data ?? [];
  const tableRows = tablesRes.data ?? [];
  const lastSeenAt = agentRes.data?.last_seen_at ?? null;

  return {
    todayRevenue: paymentRows.reduce((sum, r) => sum + Number(r.amount), 0),
    paidOrders: paymentRows.length,
    tablesTotal: tableRows.length,
    tablesOccupied: tableRows.filter((t) => t.status === "occupied").length,
    kitchenActiveOrders: kitchenRes.count ?? 0,
    posSessionOpenedAt: sessionRes.data?.opened_at ?? null,
    printerHasAgent: lastSeenAt !== null,
    printerOnline:
      lastSeenAt !== null &&
      Date.now() - new Date(lastSeenAt).getTime() < AGENT_OFFLINE_THRESHOLD_MS,
    printerFailed24h: failedRes.count ?? 0,
    pendingCheckouts: checkoutRes.count ?? 0,
  };
}
