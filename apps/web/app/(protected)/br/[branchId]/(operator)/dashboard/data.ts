import { cache } from "react";
import { PERMISSION_KEYS, type JwtClaims } from "@comtammatu/shared/auth";
import type { loadAuthState } from "@/_lib/auth";
import { resolveCountSlipReviewerEmployeeId } from "@lib/inventory/count-slip-reviewer";
import { STOCK_FULFILLMENT_RECEIVE_READY_STATUSES } from "@lib/inventory/stock-fulfillment-hub-model";
import { requestNow } from "@/_lib/request-now";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

export interface BranchQueueCounts {
  pendingCheckouts: number | null;
  pendingLeaveRequests: number | null;
  pendingCountSlips: number | null;
  pendingWaste: number | null;
  inboundTransfers: number | null;
  openStockRequests: number | null;
  pendingVoids: number | null;
  outOfStockAlerts: number | null;
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
 * Open YCH counts are store-branch only (requester = this branch).
 */
export const fetchBranchQueueCounts = cache(
  async function fetchBranchQueueCounts(
    supabase: ServerClient,
    claims: JwtClaims,
    userId: string,
    branchId: number,
    branchKind?: string | null,
  ): Promise<BranchQueueCounts> {
    const isStoreBranch = branchKind === "branch";
    const nowIso = (await requestNow()).toISOString();
    const reviewerEmployeeIdPromise = resolveCountSlipReviewerEmployeeId(
      claims.tenant_id,
      userId,
    );
    const canSeeVoids =
      isStoreBranch &&
      (claims.user_role === "owner" ||
        claims.user_role === "branch_manager" ||
        claims.user_role === "cashier" ||
        claims.user_role === "chef" ||
        claims.user_role === "branch_staff");
    const canSeeOutOfStock =
      isStoreBranch &&
      (claims.user_role === "owner" ||
        claims.user_role === "branch_manager" ||
        claims.user_role === "cashier");
    const [
      checkoutPermission,
      leavePermission,
      countPermission,
      wastePermission,
      transferPermission,
      requestPermission,
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
      isStoreBranch
        ? supabase.rpc("has_permission", {
            p_branch_id: branchId,
            p_key: PERMISSION_KEYS.INVENTORY_REQUEST_CREATE,
          })
        : Promise.resolve({ data: false as boolean | null }),
    ]);
    const reviewerEmployeeId = await reviewerEmployeeIdPromise;
    let countSlipsQuery = supabase
      .from("inventory_count_slips")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "submitted");
    if (reviewerEmployeeId !== null) {
      countSlipsQuery = countSlipsQuery.neq("employee_id", reviewerEmployeeId);
    }
    const [
      checkoutRes,
      leaveRes,
      countRes,
      wasteRes,
      inboundTransferRes,
      openStockRequestRes,
      voidRes,
      outOfStockRes,
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
      countPermission.data === true ? countSlipsQuery : Promise.resolve(null),
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
            .in("status", [...STOCK_FULFILLMENT_RECEIVE_READY_STATUSES])
        : Promise.resolve(null),
      requestPermission.data === true
        ? supabase
            .from("stock_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .in("status", ["draft", "submitted"])
        : Promise.resolve(null),
      canSeeVoids
        ? supabase
            .from("pos_void_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", branchId)
            .eq("status", "pending")
        : Promise.resolve(null),
      canSeeOutOfStock
        ? supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("target_branch_id", branchId)
            .eq("kind", "pos.kds_out_of_stock")
            .or(
              `expires_at.is.null,expires_at.gt.${nowIso}`,
            )
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
      openStockRequests: openStockRequestRes
        ? (openStockRequestRes.count ?? 0)
        : null,
      pendingVoids: voidRes ? (voidRes.count ?? 0) : null,
      outOfStockAlerts: outOfStockRes ? (outOfStockRes.count ?? 0) : null,
    };
  },
);
