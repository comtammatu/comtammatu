import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { ZERO_DRAFTS, type UserDrafts } from "./user-drafts-types";

export { userDraftsTotal, type UserDrafts } from "./user-drafts-types";

/**
 * Personal-workspace re-entry counts for the "Resume drafts" strip
 * rendered by the inventory layout shell. Counts represent rows the
 * current user authored that are still unfinished — distinct from
 * Phase 2 playbook tasks which are branch-scoped operational work.
 *
 * Cross-branch by design: a super_manager that started a PO draft on
 * branch A still sees it on the strip while browsing branch B, so the
 * draft never gets "lost" by sidebar branch switching.
 */
export async function loadUserDrafts(): Promise<UserDrafts> {
  try {
    const { supabase, session, claims } = await loadAuthState();
    const userId = session.user.id;
    const tenantId = claims.tenant_id;

    // Permission gating — skip the count entirely for entities the user
    // can't act on. RLS does not filter by created_by, so we always need
    // the explicit `eq("created_by", userId)` predicate.
    const [
      canPo,
      canGrn,
      canTransfer,
      canSupplierReturn,
      canWriteoff,
      canStocktake,
    ] = await Promise.all([
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
      currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE),
      currentUserHasPermissionAny(PERMISSION_KEYS.SUPPLIER_RETURN_CREATE),
      currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_WRITEOFF),
      currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE),
    ]);

    const headOpts = { count: "exact" as const, head: true };

    const [
      poRes,
      grnRes,
      transferRes,
      supplierReturnRes,
      wasteRes,
      stocktakeRes,
    ] = await Promise.all([
      canPo
        ? supabase
            .from("purchase_orders")
            .select("*", headOpts)
            .eq("tenant_id", tenantId)
            .eq("created_by", userId)
            .eq("status", "draft")
        : Promise.resolve({ count: 0, error: null }),
      canGrn
        ? supabase
            .from("goods_received_notes")
            .select("*", headOpts)
            .eq("tenant_id", tenantId)
            .eq("created_by", userId)
            .eq("status", "draft")
        : Promise.resolve({ count: 0, error: null }),
      canTransfer
        ? supabase
            .from("stock_transfers")
            .select("*", headOpts)
            .eq("tenant_id", tenantId)
            .eq("created_by", userId)
            .eq("status", "draft")
        : Promise.resolve({ count: 0, error: null }),
      canSupplierReturn
        ? supabase
            .from("supplier_returns")
            .select("*", headOpts)
            .eq("tenant_id", tenantId)
            .eq("created_by", userId)
            .eq("status", "draft")
        : Promise.resolve({ count: 0, error: null }),
      canWriteoff
        ? supabase
            .from("stock_issues")
            .select("*", headOpts)
            .eq("tenant_id", tenantId)
            .eq("created_by", userId)
            .eq("issue_type", "writeoff")
            .eq("approval_status", "pending")
        : Promise.resolve({ count: 0, error: null }),
      canStocktake
        ? supabase
            .from("stocktake_sessions")
            .select("*", headOpts)
            .eq("tenant_id", tenantId)
            .eq("created_by", userId)
            .eq("status", "in_progress")
        : Promise.resolve({ count: 0, error: null }),
    ]);

    return {
      po: poRes.count ?? 0,
      grn: grnRes.count ?? 0,
      transfer: transferRes.count ?? 0,
      supplierReturn: supplierReturnRes.count ?? 0,
      wastePending: wasteRes.count ?? 0,
      stocktakeOpen: stocktakeRes.count ?? 0,
    };
  } catch {
    // Layout must still render if any single count query glitches —
    // never bubble auth/DB errors up to break the entire shell.
    return ZERO_DRAFTS;
  }
}
