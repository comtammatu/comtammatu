"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";
import {
  resolveDefaultInventoryLocation,
  withInventoryLocationCompatFallback,
} from "./_lib/inventory-location-compat";

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

export async function fetchStockIssues(opts?: {
  branchId?: number;
  status?: string;
}): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- location columns are compatibility-prep before db:types regenerate
  const sb = supabase as any;
  const buildQuery = (selectClause: string) => {
    let query = sb
      .from("stock_issues")
      .select(selectClause)
      .eq("tenant_id", claims.tenant_id)
      .order("issued_at", { ascending: false });

    if (opts?.branchId) {
      query = query.eq("branch_id", opts.branchId);
    }
    if (opts?.status) {
      query = query.eq("status", opts.status);
    }
    if (claims.branch_id) {
      query = query.eq("branch_id", claims.branch_id);
    }
    return query;
  };

  const { data, error } = await withInventoryLocationCompatFallback(
    () =>
      buildQuery(
        "id, issue_number, issue_type, status, notes, issued_at, branch_id, source_location_id, target_location_id, branches ( id, name )",
      ),
    () =>
      buildQuery(
        "id, issue_number, issue_type, status, notes, issued_at, branch_id, branches ( id, name )",
      ),
  );
  if (error) {
    return { success: false, error: "Không thể tải danh sách phiếu xuất." };
  }
  return { success: true, data: data ?? [] };
}

/* ─── createStockIssueDraft ─── */

export async function createStockIssueDraft(
  input: z.infer<typeof issueCreateSchema>,
): Promise<ActionResult> {
  const parsed = issueCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;
  const d = parsed.data;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- location columns are compatibility-prep before db:types regenerate
  const sb = supabase as any;
  const basePayload = {
    tenant_id: claims.tenant_id,
    branch_id: d.branchId,
    issue_number: issueNumber,
    issue_type: d.issueType,
    notes: d.notes ?? null,
    created_by: user.id,
  };

  const { data, error } = await withInventoryLocationCompatFallback(
    () =>
      sb
        .from("stock_issues")
        .insert({
          ...basePayload,
          source_location_id: sourceLocationId,
          target_location_id: targetLocationId,
        })
        .select("id, source_location_id, target_location_id")
        .single(),
    () => sb.from("stock_issues").insert(basePayload).select("id").single(),
  );

  if (error) {
    return { success: false, error: "Không thể tạo phiếu xuất." };
  }
  return { success: true, data };
}

/* ─── fetchStockIssueDetail ─── */

export async function fetchStockIssueDetail(
  issueId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- location columns are compatibility-prep before db:types regenerate
  const sb = supabase as any;

  const [issueRes, linesRes] = await Promise.all([
    withInventoryLocationCompatFallback(
      () =>
        sb
          .from("stock_issues")
          .select(
            "id, issue_number, issue_type, status, notes, issued_at, branch_id, source_location_id, target_location_id, branches ( id, name )",
          )
          .eq("id", id.data)
          .eq("tenant_id", claims.tenant_id)
          .single(),
      () =>
        sb
          .from("stock_issues")
          .select(
            "id, issue_number, issue_type, status, notes, issued_at, branch_id, branches ( id, name )",
          )
          .eq("id", id.data)
          .eq("tenant_id", claims.tenant_id)
          .single(),
    ),
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

  return {
    success: true,
    data: { issue: issueRes.data, lines: linesRes.data ?? [] },
  };
}

/* ─── upsertStockIssueLine ─── */

export async function upsertStockIssueLine(
  input: z.infer<typeof issueLineSchema>,
): Promise<ActionResult> {
  const parsed = issueLineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const d = parsed.data;

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
}

/* ─── deleteStockIssueLine ─── */

export async function deleteStockIssueLine(
  input: z.infer<typeof issueLineDeleteSchema>,
): Promise<ActionResult> {
  const parsed = issueLineDeleteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const d = parsed.data;

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
}

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
