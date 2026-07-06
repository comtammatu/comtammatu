import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  PERMISSION_KEYS,
  type BranchKind,
  type JwtClaims,
} from "@comtammatu/shared/auth";
import { getRegisteredMethods } from "@comtammatu/shared/providers";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import type { loadAuthState } from "@/_lib/auth";
import { ensurePaymentProvidersRegistered } from "@lib/payment-providers-init";

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
  const failedSinceIso = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const service = createServiceClient();
  ensurePaymentProvidersRegistered();
  const registeredPaymentMethods = getRegisteredMethods();
  const hddtReady =
    !!process.env["COMPANY_TAX_CODE"] &&
    !!process.env["SINVOICE_USERNAME"] &&
    !!process.env["SINVOICE_PASSWORD"] &&
    !!process.env["SINVOICE_TEMPLATE_CODE"] &&
    !!process.env["SINVOICE_INVOICE_SERIES"];

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
    supabase.rpc("list_branch_menu_daily_limits", {
      p_branch_id: branchId,
    }),
    service
      .from("pos_terminals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    service
      .from("kds_stations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    service
      .from("printers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
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
    pendingCheckouts: checkoutRes.count ?? 0,
    menuLimitAvailableItems,
    setupActiveTerminals: terminalRes.count ?? 0,
    setupActiveKdsStations: stationRes.count ?? 0,
    setupActivePrinters: printerRes.count ?? 0,
    setupActiveStaff: staffRes.count ?? 0,
    setupPaymentReady: registeredPaymentMethods.length > 0,
    setupHddtReady: hddtReady,
  };
}

export interface BranchQueueCounts {
  pendingCheckouts: number | null;
  pendingLeaveRequests: number | null;
  pendingCountSlips: number | null;
  pendingWaste: number | null;
  draftGrns: number | null;
  openPurchaseOrders: number | null;
  draftProductionOrders: number | null;
  inboundTransfers: number | null;
}

/**
 * Permission-gated pending counts for the hub's unified "Cần xử lý" queue.
 * Each field is `null` when the role lacks the underlying approval
 * permission (row must not render) and a number — 0 included — when the
 * role holds it (row always renders, per V2's "queue is the persistent
 * browse door" rule). One aggregate `Promise.all`, fail-soft per metric.
 */
export async function fetchBranchQueueCounts(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
  branchKind: BranchKind = "branch",
): Promise<BranchQueueCounts> {
  const service = createServiceClient();
  const isCentralSupply = branchKind === "central_supply";
  const isCentralKitchen = branchKind === "central_kitchen";

  const [
    checkoutPermission,
    leavePermission,
    countPermission,
    wastePermission,
    grnPermission,
    poPermission,
    productionPermission,
    transferPermission,
  ] = await Promise.all([
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
    }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
    }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
    }),
    isCentralSupply
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
        })
      : Promise.resolve({ data: false }),
    isCentralSupply
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.PROCUREMENT_READ,
        })
      : Promise.resolve({ data: false }),
    isCentralKitchen
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
        })
      : Promise.resolve({ data: false }),
    isCentralKitchen
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE,
        })
      : Promise.resolve({ data: false }),
  ]);
  const [
    checkoutRes,
    leaveRes,
    countRes,
    wasteRes,
    draftGrnRes,
    openPoRes,
    draftProductionRes,
    inboundTransferRes,
  ] = await Promise.all([
      checkoutPermission.data === true
        ? service
            .from("attendance_records")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .is("check_out", null)
            .not("checkout_requested_at", "is", null)
        : Promise.resolve(null),
      leavePermission.data === true
        ? service
            .from("leave_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .eq("status", "pending")
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
      grnPermission.data === true
        ? supabase
            .from("goods_received_notes")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .eq("status", "draft")
        : Promise.resolve(null),
      poPermission.data === true
        ? supabase
            .from("purchase_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .in("status", ["sent", "partially_received"])
        : Promise.resolve(null),
      productionPermission.data === true
        ? supabase
            .from("production_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .eq("status", "draft")
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
    pendingCheckouts: checkoutRes ? (checkoutRes.count ?? 0) : null,
    pendingLeaveRequests: leaveRes ? (leaveRes.count ?? 0) : null,
    pendingCountSlips: countRes ? (countRes.count ?? 0) : null,
    pendingWaste: wasteRes ? (wasteRes.count ?? 0) : null,
    draftGrns: draftGrnRes ? (draftGrnRes.count ?? 0) : null,
    openPurchaseOrders: openPoRes ? (openPoRes.count ?? 0) : null,
    draftProductionOrders: draftProductionRes
      ? (draftProductionRes.count ?? 0)
      : null,
    inboundTransfers: inboundTransferRes
      ? (inboundTransferRes.count ?? 0)
      : null,
  };
}
