"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import {
  computeIssueLineTotal,
  getIssueBaseQuantity,
} from "./_lib/issue-units";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";
import type { TenantSupabase } from "@lib/inventory/types";
import { allocateInventoryDocNumber } from "./_lib/inventory-doc-number";
import {
  getEmbeddedIngredientBaseUnitDisplayName,
  getEmbeddedUnitDisplayName,
} from "./_lib/unit-display";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import {
  insufficientStockFailure,
  mapInventoryRpcFailure,
} from "./_lib/rpc-failure";
import {
  issueConfirmRpcFallback,
  issueConfirmRpcMappings,
  issueLineRpcFallback,
  issueLineRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

const ROLES = INVENTORY_OPS_ROLES;

function revalidateStockIssueSurfaces({
  issueId,
  branchId,
  issueType,
}: {
  issueId: number;
  branchId: number;
  issueType: string;
}) {
  revalidatePath("/inventory/consumption");
  revalidatePath(`/inventory/consumption/${issueId}`);
  const branchSurface = issueType === "consumption" ? "consumption" : "issues";
  revalidatePath(`/br/${branchId}/stock/${branchSurface}`);
  revalidatePath(`/br/${branchId}/stock/${branchSurface}/${issueId}`);
}

/* ─── Schemas ─── */

const issueCreateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  // Manual writeoff/hao hụt is created only via create_waste_entry (/waste).
  issueType: z.enum(["consumption"]).default("consumption"),
  notes: z.string().optional(),
});

// WAC strict override (see confirm_stock_issue RPC): stock_issue_items.unit_cost
// is re-written from stock_levels.avg_unit_cost at confirm time. Line callers
// do not need to pass unitCost — DB DEFAULT 0 applies on INSERT.
const issueLineSchema = z.object({
  issueId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  // Missing value resolves to the ingredient base entry unit.
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().trim().optional().nullable(),
  photoUrls: z.array(z.string().url()).max(1).optional(),
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
): Promise<number | null> {
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("location_kind", "warehouse")
    .eq("is_active", true)
    .order("is_default_issue", { ascending: false })
    .order("is_default_consumption", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(2);

  if (error) throw error;
  return data?.length === 1 ? (data[0]?.id ?? null) : null;
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
    return { success: false, error: messages.inventory.issues.listLoadFailed };
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

    const allocated = await allocateInventoryDocNumber(
      supabase,
      claims.tenant_id,
      "issue",
    );
    if (!allocated.ok) {
      return { success: false, error: "Không thể tạo mã phiếu xuất." };
    }
    const issueNumber = allocated.code;
    const sourceLocationId = await resolveIssueSourceLocation(
      supabase,
      claims.tenant_id,
      d.branchId,
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
    revalidateStockIssueSurfaces({
      issueId: data.id,
      branchId: d.branchId,
      issueType: d.issueType,
    });
    return { success: true, data };
  },
);

/* ─── fetchStockIssueDetail ─── */

export async function fetchStockIssueDetail(
  issueId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success)
    return { success: false, error: "Mã phiếu xuất không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const lineReadClient = monetary.valuation
    ? (monetary.client ?? supabase)
    : supabase;

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
  const ingredientUnitsSelect =
    "ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, units!ingredient_units_unit_tenant_fkey(code, name))";
  const linesQuery = monetary.valuation
    ? lineReadClient
        .from("stock_issue_items")
        .select(
          `id, ingredient_id, quantity, entry_unit_id, unit_cost, total_cost, reason, photo_urls, unit_obj:units!stock_issue_items_entry_unit_id_fkey(code, name), ingredients ( id, name, ${ingredientUnitsSelect} )`,
        )
    : lineReadClient
        .from("stock_issue_items")
        .select(
          `id, ingredient_id, quantity, entry_unit_id, reason, photo_urls, unit_obj:units!stock_issue_items_entry_unit_id_fkey(code, name), ingredients ( id, name, ${ingredientUnitsSelect} )`,
        );

  const [issueRes, linesRes] = await Promise.all([
    issueQuery.single(),
    linesQuery
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
  const lines = (linesRes.data ?? []).map((line) => {
    const ingredient = line.ingredients as {
      id: number;
      name: string;
      ingredient_units?: Array<{
        unit_id: number;
        to_base_factor: number | string;
        is_base: boolean;
        units?: unknown;
      }> | null;
    } | null;
    const entryUnitId =
      line.entry_unit_id == null ? null : Number(line.entry_unit_id);
    const ingredientUnits = Array.isArray(ingredient?.ingredient_units)
      ? ingredient.ingredient_units
      : [];
    const entryUnitRow =
      entryUnitId == null
        ? null
        : (ingredientUnits.find((row) => Number(row.unit_id) === entryUnitId) ??
          null);
    const baseUnitRow =
      ingredientUnits.find((row) => row.is_base === true) ?? null;
    const toBaseFactor = Number(entryUnitRow?.to_base_factor ?? 1);
    const unit =
      getEmbeddedUnitDisplayName(line.unit_obj) ??
      getEmbeddedIngredientBaseUnitDisplayName(line.ingredients) ??
      "";
    const baseUnit =
      getEmbeddedUnitDisplayName(baseUnitRow?.units) ??
      getEmbeddedIngredientBaseUnitDisplayName(line.ingredients) ??
      unit;
    const entryQuantity = Number(line.quantity ?? 0);
    const unitCost =
      monetary.valuation && "unit_cost" in line
        ? Number(line.unit_cost ?? 0)
        : 0;
    const { total: correctedTotalCost } = computeIssueLineTotal({
      entryQuantity,
      baseUnitCost: unitCost,
      toBaseFactor: Number.isFinite(toBaseFactor) ? toBaseFactor : 1,
    });
    return {
      ...line,
      monetary: monetary.valuation
        ? {
            unitCost,
            totalCost: correctedTotalCost,
          }
        : null,
      unit_cost: undefined,
      total_cost: undefined,
      unit,
      baseUnit,
      toBaseFactor: Number.isFinite(toBaseFactor) && toBaseFactor > 0
        ? toBaseFactor
        : 1,
      ingredients: ingredient
        ? {
            id: ingredient.id,
            name: ingredient.name,
            unit,
          }
        : null,
    };
  });

  return {
    success: true,
    data: { tenantId: claims.tenant_id, issue, lines },
  };
}

/* ─── upsertStockIssueLine ─── */

export const upsertStockIssueLine = withAction(
  { roles: ROLES, schema: issueLineSchema, requireBranchScope: true },
  async (d, { supabase, claims }) => {
    const { data: issue } = await supabase
      .from("stock_issues")
      .select("branch_id, source_location_id, status, issue_type")
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
    let stockLevel: { current_quantity: number | null } | null = null;
    if (issue.source_location_id) {
      const stockLevelRes = await supabase
        .from("stock_levels")
        .select("current_quantity")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", issue.branch_id)
        .eq("location_id", issue.source_location_id)
        .eq("ingredient_id", d.ingredientId)
        .maybeSingle();
      if (stockLevelRes.error) {
        return {
          success: false,
          error: messages.inventory.issues.lineWacLoadFailed,
        };
      }
      stockLevel = stockLevelRes.data;
    }
    const requestedBaseQuantity = getIssueBaseQuantity(
      d.quantity,
      resolvedUnit,
    );
    const availableQuantity = Number(stockLevel?.current_quantity ?? 0);
    if (
      issue.source_location_id &&
      requestedBaseQuantity > availableQuantity + 1e-9
    ) {
      return insufficientStockFailure(d.ingredientId);
    }

    const { error } = await supabase.rpc("save_stock_issue_line" as never, {
      p_issue_id: d.issueId,
      p_ingredient_id: d.ingredientId,
      p_quantity: d.quantity,
      p_entry_unit_id: resolvedUnit.unitId,
      p_reason: d.reason ?? null,
      ...(d.photoUrls === undefined ? {} : { p_photo_urls: d.photoUrls }),
    } as never);

    if (error) {
      return mapInventoryRpcFailure(
        error,
        issueLineRpcMappings,
        issueLineRpcFallback,
      );
    }
    revalidateStockIssueSurfaces({
      issueId: d.issueId,
      branchId: issue.branch_id,
      issueType: issue.issue_type,
    });
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
      .select("status, branch_id, issue_type")
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
    revalidateStockIssueSurfaces({
      issueId: d.issueId,
      branchId: issue.branch_id,
      issueType: issue.issue_type,
    });
    return { success: true };
  },
);

/* ─── confirmStockIssue ─── */

export async function confirmStockIssue(
  issueId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success)
    return { success: false, error: "Mã phiếu xuất không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const { data: issue } = await supabase
    .from("stock_issues")
    .select("branch_id, issue_type")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (!issue) return { success: false, error: "Không tìm thấy phiếu xuất." };

  const { data, error } = await supabase.rpc("confirm_stock_issue", {
    p_issue_id: id.data,
  });

  if (error) {
    console.error("inventory.issue.confirm_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return mapInventoryRpcFailure(
      error,
      issueConfirmRpcMappings,
      issueConfirmRpcFallback,
    );
  }

  revalidateStockIssueSurfaces({
    issueId: id.data,
    branchId: issue.branch_id,
    issueType: issue.issue_type,
  });
  return { success: true, data };
}

/* ─── cancelStockIssue ─── */

export async function cancelStockIssue(issueId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(issueId);
  if (!id.success)
    return { success: false, error: "Mã phiếu xuất không hợp lệ" };

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_issues")
    .update({ status: "cancelled" })
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft")
    .select("id, branch_id, issue_type");

  if (error) {
    return { success: false, error: "Không thể hủy phiếu xuất." };
  }
  if (!data || data.length === 0) {
    return { success: false, error: "Không tìm thấy phiếu xuất nháp để hủy." };
  }
  const issue = data[0];
  if (!issue) {
    return { success: false, error: "Không tìm thấy phiếu xuất nháp để hủy." };
  }
  revalidateStockIssueSurfaces({
    issueId: id.data,
    branchId: issue.branch_id,
    issueType: issue.issue_type,
  });
  return { success: true };
}
