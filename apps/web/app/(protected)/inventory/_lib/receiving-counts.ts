"use server";

import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import {
  getAuthContextWithAnyPermission,
  getAuthContextWithPermission,
} from "./auth";

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

/** Draft GRNs that already have received qty but still miss a booked unit price. */
export async function countGrnsAwaitingUnitPrice(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("grn_items")
    .select(
      "grn_id, unit_cost, unit_cost_unit_id, goods_received_notes!inner(status, branch_id)",
    )
    .eq("tenant_id", claims.tenant_id)
    .gt("received_quantity", 0)
    .in("goods_received_notes.status", ["draft", "pending"]);
  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }
  const { data, error } = await query.limit(1000);
  if (error || data == null) return 0;
  const awaiting = new Set<number>();
  for (const row of data) {
    if (row.grn_id == null) continue;
    const unitCost =
      row.unit_cost == null ? Number.NaN : Number(row.unit_cost);
    const hasPrice =
      Number.isFinite(unitCost) &&
      unitCost > 0 &&
      row.unit_cost_unit_id != null;
    if (!hasPrice) awaiting.add(row.grn_id);
  }
  return awaiting.size;
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

export async function listOpenGrnsForAttention(
  branchId?: number,
): Promise<{ count: number; items: { id: number; code: string }[] }> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { count: 0, items: [] };
  const { supabase, claims } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select("id, grn_number")
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["draft", "pending"])
    .order("id")
    .limit(2);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error || !data?.length) return { count: 0, items: [] };
  const items = data.flatMap((row) =>
    row.id != null && row.grn_number
      ? [{ id: row.id, code: row.grn_number }]
      : [],
  );
  if (items.length === 0) return { count: 0, items: [] };
  if (items.length === 1) return { count: 1, items };
  return { count: await countOpenGrns(branchId), items };
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

const INVENTORY_ATTENTION_ROLES = [
  "owner",
  "central_supply_ops",
  "central_kitchen_lead",
] as const;

/** Writeoff issues awaiting 4-eye approval. */
export async function countPendingWasteApprovals(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithPermission(
    INVENTORY_ATTENTION_ROLES,
    PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("stock_issues")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .eq("issue_type", "writeoff")
    .eq("approval_status", "pending");
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** Open stock transfers still moving (not completed / cancelled). */
export async function countOpenStockTransfers(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_ATTENTION_ROLES,
    [
      PERMISSION_KEYS.INVENTORY_REQUEST_FULFILL,
      PERMISSION_KEYS.INVENTORY_READ,
    ],
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("stock_transfers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .in("status", [
      "draft",
      "confirmed",
      "confirmed_ship",
      "in_transit",
      "confirmed_receive",
    ]);
  if (branchId != null) {
    query = query.or(
      `from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`,
    );
  }
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** Open YCH still in fulfill queue (not draft / closed / cancelled). */
export async function countOpenStockRequests(
  branchId?: number,
): Promise<number> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_ATTENTION_ROLES,
    [
      PERMISSION_KEYS.INVENTORY_REQUEST_FULFILL,
      PERMISSION_KEYS.INVENTORY_READ,
    ],
  );
  if (!ctx) return 0;
  const { supabase, claims } = ctx;
  let query = supabase
    .from("stock_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .in("status", [
      "submitted",
      "partially_fulfilled",
      "pending",
      "allocated",
    ]);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}
