import { PERMISSION_KEYS, type JwtClaims } from "@comtammatu/shared/auth";
import { getRegisteredMethods } from "@comtammatu/shared/providers";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import type { loadAuthState } from "@/_lib/auth";
import { ensurePaymentProvidersRegistered } from "@lib/payment-providers-init";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

// Mirrors PrinterStatusIndicator: an agent is online when its heartbeat is
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
  menuLimitAvailableItems: number;
  setupActiveTerminals: number;
  setupActiveKdsStations: number;
  setupActivePrinters: number;
  setupActiveStaff: number;
  setupPaymentReady: boolean;
  setupHddtReady: boolean;
}

/**
 * Read-only day status for the Branch Command landing. Every metric is
 * fail-soft: a query error degrades that metric to 0/null instead of
 * blocking the page.
 *
 * Every query uses the caller's session so RLS/PBAC remains the authorization
 * boundary after the route resolves the requested Branch context. Checkout
 * counts use the authenticated hierarchy-aware RPC.
 */
export async function fetchBranchDayStatus(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
): Promise<BranchDayStatus> {
  const todayRange = getVNDayUtcRange(getVNDateString());
  const failedSinceIso = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  ensurePaymentProvidersRegistered();
  const registeredPaymentMethods = getRegisteredMethods();
  const hddtCredentialsReady =
    !!process.env["SINVOICE_USERNAME"] && !!process.env["SINVOICE_PASSWORD"];

  const [
    paymentsRes,
    tablesRes,
    kitchenRes,
    agentRes,
    failedRes,
    sessionRes,
    checkoutRes,
    menuLimitsRes,
    terminalRes,
    stationRes,
    printerRes,
    staffRes,
    invoiceProfileRes,
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
    supabase
      .from("pos_sessions")
      .select("opened_at")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "open")
      .maybeSingle(),
    supabase.rpc("get_checkout_review_queue", {
      p_branch_id: branchId,
      p_include_rows: false,
    }),
    supabase.rpc("list_branch_menu_daily_limits", {
      p_branch_id: branchId,
    }),
    supabase
      .from("pos_terminals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    supabase
      .from("kds_stations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    supabase
      .from("printers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    supabase
      .from("invoice_profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "active"),
  ]);

  const paymentRows = paymentsRes.data ?? [];
  const tableRows = tablesRes.data ?? [];
  const lastSeenAt = agentRes.data?.last_seen_at ?? null;
  const menuLimitRows = (menuLimitsRes.data ?? []) as Array<{
    is_disabled: boolean | null;
    available_to_sell: number | null;
  }>;
  const menuLimitAvailableItems = menuLimitsRes.error
    ? 0
    : menuLimitRows.filter((row) => {
        if (row.is_disabled) {
          return false;
        }

        return row.available_to_sell == null || row.available_to_sell > 0;
      }).length;

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
    pendingCheckouts: checkoutRes.data?.[0]?.pending_count ?? 0,
    menuLimitAvailableItems,
    setupActiveTerminals: terminalRes.count ?? 0,
    setupActiveKdsStations: stationRes.count ?? 0,
    setupActivePrinters: printerRes.count ?? 0,
    setupActiveStaff: staffRes.count ?? 0,
    setupPaymentReady: registeredPaymentMethods.length > 0,
    setupHddtReady:
      hddtCredentialsReady &&
      !invoiceProfileRes.error &&
      (invoiceProfileRes.count ?? 0) === 1,
  };
}

export interface BranchQueueCounts {
  pendingCheckouts: number | null;
  pendingLeaveRequests: number | null;
  pendingCountSlips: number | null;
  pendingWaste: number | null;
  inboundTransfers: number | null;
}

/**
 * Permission-gated pending counts for the branch home's "Cần xử lý" queue.
 * Each field is `null` when the role lacks the underlying approval
 * permission (row must not render) and a number — 0 included — when the
 * role holds it (row always renders, per V2's "queue is the persistent
 * browse door" rule). One aggregate `Promise.all`, fail-soft per metric.
 *
 * Leave/checkout review RPCs only allow `branch_kind = 'branch'`; for
 * central sites skip those RPCs and leave the fields null (no queue row).
 */
export async function fetchBranchQueueCounts(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
  branchKind?: string | null,
): Promise<BranchQueueCounts> {
  const isStoreBranch = branchKind === "branch";
  const [
    checkoutPermission,
    leavePermission,
    countPermission,
    wastePermission,
    transferPermission,
  ] = await Promise.all([
    isStoreBranch
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        })
      : Promise.resolve({ data: false as boolean | null }),
    isStoreBranch
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
        })
      : Promise.resolve({ data: false as boolean | null }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
    }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
    }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE,
    }),
  ]);
  const [
    checkoutRes,
    leaveRes,
    countRes,
    wasteRes,
    inboundTransferRes,
  ] = await Promise.all([
    checkoutPermission.data === true
      ? supabase.rpc("get_checkout_review_queue", {
          p_branch_id: branchId,
          p_include_rows: false,
        })
      : Promise.resolve(null),
    leavePermission.data === true
      ? supabase.rpc("get_leave_review_queue", {
          p_branch_id: branchId,
          p_include_rows: false,
        })
      : Promise.resolve(null),
    countPermission.data === true
      ? supabase
          .from("inventory_count_slips")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .eq("status", "submitted")
      : Promise.resolve(null),
    wastePermission.data === true
      ? supabase
          .from("stock_issues")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .eq("issue_type", "writeoff")
          .eq("approval_status", "pending")
      : Promise.resolve(null),
    transferPermission.data === true
      ? supabase
          .from("stock_transfers")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .eq("to_branch_id", branchId)
          .in("status", ["confirmed_ship", "in_transit"])
      : Promise.resolve(null),
  ]);

  return {
    pendingCheckouts: checkoutRes
      ? (checkoutRes.data?.[0]?.pending_count ?? 0)
      : null,
    pendingLeaveRequests: leaveRes
      ? (leaveRes.data?.[0]?.pending_count ?? 0)
      : null,
    pendingCountSlips: countRes ? (countRes.count ?? 0) : null,
    pendingWaste: wasteRes ? (wasteRes.count ?? 0) : null,
    inboundTransfers: inboundTransferRes
      ? (inboundTransferRes.count ?? 0)
      : null,
  };
}
