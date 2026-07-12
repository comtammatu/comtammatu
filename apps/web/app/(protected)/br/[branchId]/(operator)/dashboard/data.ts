import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type JwtClaims } from "@comtammatu/shared/auth";
import type { loadAuthState } from "@/_lib/auth";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

export interface BranchQueueCounts {
  pendingCheckouts: number | null;
  pendingLeaveRequests: number | null;
  pendingCountSlips: number | null;
  pendingWaste: number | null;
  draftGrns: number | null;
  draftProductionOrders: number | null;
}

export async function fetchBranchQueueCounts(
  supabase: ServerClient,
  claims: JwtClaims,
  branchId: number,
): Promise<BranchQueueCounts> {
  const service = createServiceClient();

  const [
    checkoutPermission,
    leavePermission,
    countPermission,
    wastePermission,
    grnPermission,
    productionPermission,
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
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
    }),
    supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
    }),
  ]);
  const [
    checkoutRes,
    leaveRes,
    countRes,
    wasteRes,
    draftGrnRes,
    draftProductionRes,
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
    productionPermission.data === true
      ? supabase
          .from("production_runs")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .in("status", ["draft", "in_progress"])
      : Promise.resolve(null),
  ]);

  return {
    pendingCheckouts: checkoutRes ? (checkoutRes.count ?? 0) : null,
    pendingLeaveRequests: leaveRes ? (leaveRes.count ?? 0) : null,
    pendingCountSlips: countRes ? (countRes.count ?? 0) : null,
    pendingWaste: wasteRes ? (wasteRes.count ?? 0) : null,
    draftGrns: draftGrnRes ? (draftGrnRes.count ?? 0) : null,
    draftProductionOrders: draftProductionRes
      ? (draftProductionRes.count ?? 0)
      : null,
  };
}
