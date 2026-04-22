"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

const ROLES = INVENTORY_OPS_ROLES;

/* ─── Schemas ─── */

const issueCreateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  issueType: z
    .enum(["consumption", "writeoff", "kitchen_use", "other"])
    .default("consumption"),
  notes: z.string().optional(),
});

const issueLineSchema = z.object({
  issueId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitCost: z.coerce.number().min(0).default(0),
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
});

export async function fetchStockIssues(opts?: {
  branchId?: number;
  status?: string;
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
      "id, issue_number, issue_type, status, notes, issued_at, branch_id, source_location_id, target_location_id, branches ( id, name, branch_kind )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("issued_at", { ascending: false });

  if (parsed.data.branchId) {
    query = query.eq("branch_id", parsed.data.branchId);
  }
  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
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
  { roles: ROLES, schema: issueCreateSchema },
  async (d, { supabase, claims, user }) => {

  // branch_manager can only create for their own branch
  if (claims.branch_id && claims.branch_id !== d.branchId) {
    return {
      success: false,
      error: "Không có quyền tạo phiếu xuất cho chi nhánh này.",
    };
  }

  const issueNumber = `PXK-${randomUUID().slice(0, 8)}`;
  const sourceLocationId = await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    d.branchId,
    "issue",
  );
  const targetLocationId =
    d.issueType === "kitchen_use"
      ? await resolveDefaultInventoryLocation(
          supabase,
          claims.tenant_id,
          d.branchId,
          "consumption",
        )
      : null;

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
      target_location_id: targetLocationId,
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
      "id, issue_number, issue_type, status, notes, issued_at, branch_id, source_location_id, target_location_id, branches ( id, name, branch_kind )",
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
        "id, ingredient_id, quantity, unit, unit_cost, total_cost, reason, ingredients ( id, name, unit )",
      )
      .eq("issue_id", id.data)
      .eq("tenant_id", claims.tenant_id)
      .order("id"),
  ]);

  if (issueRes.error || !issueRes.data) {
    return { success: false, error: "Không tìm thấy phiếu xuất." };
  }

  const branch = issueRes.data.branches as
    | {
        id: number;
        name: string;
        branch_kind?: string | null;
      }
    | null;
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
  { roles: ROLES, schema: issueLineSchema },
  async (d, { supabase, claims }) => {
    const { error } = await supabase.from("stock_issue_items").upsert(
      {
        tenant_id: claims.tenant_id,
        issue_id: d.issueId,
        ingredient_id: d.ingredientId,
        quantity: d.quantity,
        unit: d.unit,
        unit_cost: d.unitCost,
        reason: d.reason ?? null,
      },
      { onConflict: "issue_id,ingredient_id,tenant_id" },
    );

    if (error) {
      return { success: false, error: "Không thể lưu dòng phiếu xuất." };
    }
    return { success: true };
  },
);

/* ─── deleteStockIssueLine ─── */

export const deleteStockIssueLine = withAction(
  { roles: ROLES, schema: issueLineDeleteSchema },
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
    console.error("confirmStockIssue", error);
    return { success: false, error: "Không thể xác nhận phiếu xuất." };
  }

  return { success: true, data };
}

/* ─── cancelStockIssue ─── */

export async function cancelStockIssue(issueId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("stock_issues")
    .update({ status: "cancelled" })
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft");

  if (error) {
    return { success: false, error: "Không thể hủy phiếu xuất." };
  }
  return { success: true };
}
