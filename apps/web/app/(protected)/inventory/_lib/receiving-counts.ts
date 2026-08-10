"use server";

import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "./auth";

// Receiving badge counts. The landing page previously fetched the full PO / GRN /
// supplier-invoice lists (with eager joins) only to count a filtered subset and
// discard the rest. These count-only queries (head: true) return just the
// number, scoped to tenant + optional branch, matching each list's open filter.
// On missing permission or error the count is 0, preserving the prior page
// fallback.

export async function countOpenPurchaseOrders(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["draft", "sent"]);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

export async function countOpenGrns(branchId?: number): Promise<number> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["draft", "pending"]);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

export async function countOpenSupplierInvoices(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  // Branch filter rides the GRN relationship (supplier_invoices has no branch_id).
  let query = supabase
    .from("supplier_invoices")
    .select(
      branchId != null ? "id, goods_received_notes!inner ( branch_id )" : "id",
      { count: "exact", head: true },
    )
    .eq("tenant_id", claims.tenant_id)
    .in("matching_status", ["pending", "discrepancy"]);
  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** Open YCM awaiting allocation (submitted / pending_allocation). */
export async function countOpenPurchaseRequests(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("purchase_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["submitted", "pending_allocation"]);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}
