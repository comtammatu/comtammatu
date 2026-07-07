"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import { getIssueBaseQuantity } from "./_lib/issue-units";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";
import type { TenantSupabase } from "./_lib/types";

const ROLES = INVENTORY_OPS_ROLES;

/* ─── Schemas ─── */

const issueCreateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  issueType: z
    .enum(["consumption", "writeoff", "other"])
    .default("consumption"),
  notes: z.string().optional(),
});

// WAC strict override (see confirm_stock_issue RPC): stock_issue_items.unit_cost
// is re-written from stock_levels.avg_unit_cost at confirm time. Line callers
// do not need to pass unitCost — DB DEFAULT 0 applies on INSERT.
const issueLineSchema = z.object({
  issueId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  // Issue-role unit the qty was entered in. NULL = already base;
  // confirm_stock_issue converts to the ingredient base via inv_to_base().
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().trim().optional().nullable(),
});

const issueLineDeleteSchema = z.object({
  issueId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

/* ─── fetchStockIssues ─── */

const fetchStockIssuesSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  issueTypes: z.array(z.string()).optional(),
});

async function resolveIssueSourceLocation(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number,
  issueType: string,
): Promise<number | null> {
  if (issueType === "consumption") {
    const { data, error } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .eq("location_kind", "kitchen")
      .eq("is_active", true)
      .order("is_default_consumption", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id;
  }

  return resolveDefaultInventoryLocation(supabase, tenantId, branchId, "issue");
}

export async function fetchStockIssues(opts?: {
  branchId?: number;
  status?: string;
  issueTypes?: string[];
}): Promise<ActionResult> {
  const parsed = fetchStockIssuesSchema.safeParse(opts ?? {});
  if (!parsed.success) {
    return { success: false, error: "Tham số không hợp lệ" };
  }

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("stock_issues")
    .select(
      "id, issue_number, issue_type, status, notes, issued_at, branch_id, source_location_id, target_location_id, source_type, source_ref, branches ( id, name, branch_kind )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("issued_at", { ascending: false })
    .limit(200);

  if (parsed.data.branchId) {
    query = query.eq("branch_id", parsed.data.branchId);
  }
  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }
  if (parsed.data.issueTypes && parsed.data.issueTypes.length > 0) {
    query = query.in("issue_type", parsed.data.issueTypes);
  }
  if (claims.branch_id) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không thể tải danh sách phiếu xuất." };
  }
  return { success: true, data: data ?? [] };
}

/* ─── createStockIssueDraft ─── */

export const createStockIssueDraft = withAction(
  { roles: ROLES, schema: issueCreateSchema, requireBranchScope: true },
  async (d, { supabase, claims, user }) => {
    // branch_manager can only create for their own branch
    if (claims.branch_id && claims.branch_id !== d.branchId) {
      return {
        success: false,
        error: "Không có quyền tạo phiếu xuất cho chi nhánh này.",
      };
    }

    const issueNumber = `PXK-${randomUUID().slice(0, 8)}`;
    const sourceLocationId = await resolveIssueSourceLocation(
      supabase,
      claims.tenant_id,
      d.branchId,
      d.issueType,
    );
    if (!sourceLocationId) {
      return { success: false, error: "Chưa cấu hình vị trí xuất kho." };
    }

    // kitchen_use is not a valid stock-issue reason; sale usage posts as consumption.
    // target_location_id is always NULL for single-site issues.
    const { data, error } = await supabase
      .from("stock_issues")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: d.branchId,
        issue_number: issueNumber,
        issue_type: d.issueType,
        notes: d.notes ?? null,
        created_by: user.id,
        source_location_id: sourceLocationId,
        target_location_id: null,
      })
      .select("id, source_location_id, target_location_id")
      .single();

    // RLS returns { data: null, error: null } on blocked writes
    if (error || !data) {
      return { success: false, error: "Không thể tạo phiếu xuất." };
    }
    return { success: true, data };
  },
);

/* ─── fetchStockIssueDetail ─── */

export async function fetchStockIssueDetail(
  issueId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let issueQuery = supabase
    .from("stock_issues")
    .select(
      "id, issue_number, issue_type, status, notes, issued_at, branch_id, source_location_id, target_location_id, source_type, source_ref, branches ( id, name, branch_kind )",
    )
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id);

  // Branch manager can only view their own branch's issues
  if (claims.branch_id) {
    issueQuery = issueQuery.eq("branch_id", claims.branch_id);
  }

  const [issueRes, linesRes] = await Promise.all([
    issueQuery.single(),
    supabase
      .from("stock_issue_items")
      .select(
        "id, ingredient_id, quantity, unit, entry_unit_id, unit_cost, total_cost, reason, ingredients ( id, name, ingredient_units(is_base, units!ingredient_units_unit_id_fkey(code)) )",
      )
      .eq("issue_id", id.data)
      .eq("tenant_id", claims.tenant_id)
      .order("id"),
  ]);

  if (issueRes.error || !issueRes.data) {
    return { success: false, error: "Không tìm thấy phiếu xuất." };
  }

  const branch = issueRes.data.branches as {
    id: number;
    name: string;
    branch_kind?: string | null;
  } | null;
  const issue = {
    ...issueRes.data,
    branches: branch
      ? { ...branch, name: getBranchSiteDisplayName(branch) }
      : branch,
  };

  return {
    success: true,
    data: { issue, lines: linesRes.data ?? [] },
  };
}

/* ─── upsertStockIssueLine ─── */

export const upsertStockIssueLine = withAction(
  { roles: ROLES, schema: issueLineSchema, requireBranchScope: true },
  async (d, { supabase, claims }) => {
    const { data: issue } = await supabase
      .from("stock_issues")
      .select("branch_id, source_location_id, status")
      .eq("id", d.issueId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    if (!issue || issue.status !== "draft") {
      return {
        success: false,
        error: "Chỉ có thể lưu dòng khi phiếu còn ở trạng thái nháp.",
      };
    }

    const resolvedUnit = await resolveEntryUnitCode(supabase, {
      tenantId: claims.tenant_id,
      ingredientId: d.ingredientId,
      entryUnitId: d.entryUnitId,
    });
    if (!resolvedUnit.success) {
      return { success: false, error: resolvedUnit.error };
    }
    let stockLevel: {
      avg_unit_cost: number | null;
      current_quantity: number | null;
    } | null = null;
    if (issue.source_location_id) {
      const stockLevelRes = await supabase
        .from("stock_levels")
        .select("avg_unit_cost, current_quantity")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", issue.branch_id)
        .eq("location_id", issue.source_location_id)
        .eq("ingredient_id", d.ingredientId)
        .maybeSingle();
      if (stockLevelRes.error) {
        return {
          success: false,
          error: "Không thể tải WAG cho dòng phiếu xuất.",
        };
      }
      stockLevel = stockLevelRes.data;
    }
    const unitCost = Number(stockLevel?.avg_unit_cost ?? 0);
    const requestedBaseQuantity = getIssueBaseQuantity(
      d.quantity,
      resolvedUnit,
    );
    const availableQuantity = Number(stockLevel?.current_quantity ?? 0);
    if (
      issue.source_location_id &&
      requestedBaseQuantity > availableQuantity + 1e-9
    ) {
      return { success: false, error: "Số lượng vượt tồn hiện tại." };
    }

    // confirm_stock_issue rewrites this from WAC again at commit time.
    const { error } = await supabase.from("stock_issue_items").upsert(
      {
        tenant_id: claims.tenant_id,
        issue_id: d.issueId,
        ingredient_id: d.ingredientId,
        quantity: d.quantity,
        entry_unit_id: d.entryUnitId ?? null,
        unit_cost: Number.isFinite(unitCost) ? unitCost : 0,
        reason: d.reason ?? null,
      },
      { onConflict: "issue_id,ingredient_id,tenant_id" },
    );

    if (error) {
      return { success: false, error: "Không thể lưu dòng phiếu xuất." };
    }
    revalidatePath(`/inventory/issues/${d.issueId}`);
    return { success: true };
  },
);

/* ─── deleteStockIssueLine ─── */

export const deleteStockIssueLine = withAction(
  { roles: ROLES, schema: issueLineDeleteSchema, requireBranchScope: true },
  async (d, { supabase, claims }) => {
    // Verify issue is still draft
    const { data: issue } = await supabase
      .from("stock_issues")
      .select("status")
      .eq("id", d.issueId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (issue?.status !== "draft") {
      return {
        success: false,
        error: "Chỉ có thể xóa dòng khi phiếu còn ở trạng thái nháp.",
      };
    }

    const { error } = await supabase
      .from("stock_issue_items")
      .delete()
      .eq("id", d.itemId)
      .eq("issue_id", d.issueId)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể xóa dòng." };
    }
    revalidatePath(`/inventory/issues/${d.issueId}`);
    return { success: true };
  },
);

/* ─── confirmStockIssue ─── */

export async function confirmStockIssue(
  issueId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("confirm_stock_issue", {
    p_issue_id: id.data,
  });

  if (error) {
    if (error.message.includes("insufficient_stock")) {
      return {
        success: false,
        error: "Tồn kho không đủ để xuất. Kiểm tra lại số lượng.",
      };
    }
    console.error("inventory.issue.confirm_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể xác nhận phiếu xuất." };
  }

  revalidatePath("/inventory/issues");
  revalidatePath(`/inventory/issues/${id.data}`);
  return { success: true, data };
}

/* ─── cancelStockIssue ─── */

export async function cancelStockIssue(issueId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_issues")
    .update({ status: "cancelled" })
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    return { success: false, error: "Không thể hủy phiếu xuất." };
  }
  if (!data || data.length === 0) {
    return { success: false, error: "Không tìm thấy phiếu xuất nháp để hủy." };
  }
  revalidatePath("/inventory/issues");
  revalidatePath(`/inventory/issues/${id.data}`);
  return { success: true };
}
