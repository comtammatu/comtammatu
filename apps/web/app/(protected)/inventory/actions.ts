"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";
import {
  getAuthContext,
  getAuthContextWithPermission,
} from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { resolveInventoryBranchScope } from "./_lib/inventory-scope";
import { PG_ERR } from "./_lib/constants";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";
import { getEmbeddedIngredientBaseUnitDisplayName } from "./_lib/unit-display";
import { inventoryNonnegativeQuantitySchema } from "./_lib/inventory-quantity-schema";


/* ─── Stocktake Schemas ─── */

const stocktakeSessionIdSchema = z.coerce.number().int().positive();
const stocktakeLineUpdateSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  countedQuantity: inventoryNonnegativeQuantitySchema,
  varianceReason: z.string().optional(),
  reasonCode: z
    .enum([
      "spoiled",
      "expired",
      "dropped",
      "overcook",
      "burned",
      "contaminated",
      "quality_fail",
      "found_missing",
      "theft_suspected",
      "customer_return",
      "kds_cancel_mid_cook",
      "kds_cancel_after_cook",
      "other",
    ])
    .nullable()
    .optional(),
});

/* ─── Stocktake Actions ─── */

export async function createStocktakeSession(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Mã chi nhánh không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    INVENTORY_OPS_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    parsedBranch.data,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    parsedBranch.data,
  );
  if (scope.selectedBranchId !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsedBranch.data
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: branchData, error: branchError } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("id", parsedBranch.data)
    .single();

  if (branchError || !branchData) {
    return { success: false, error: "Không tìm thấy chi nhánh" };
  }

  let defaultLocationId: number | null = null;
  if (branchData.branch_kind === "branch") {
    const { data: locData, error: locError } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", parsedBranch.data)
      .eq("location_kind", "warehouse")
      .eq("is_active", true)
      .order("is_default_receive", { ascending: false })
      .order("is_default_issue", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!locError && locData) {
      defaultLocationId = locData.id;
    }
  }

  if (!defaultLocationId) {
    defaultLocationId = await resolveDefaultInventoryLocation(
      supabase,
      claims.tenant_id,
      parsedBranch.data,
      "receive",
    );
  }

  const { data, error } = await supabase.rpc("create_stocktake_session", {
    p_branch_id: parsedBranch.data,
    p_location_id: defaultLocationId ?? undefined,
  });

  if (error) {
    console.error("[inventory/actions:createStocktakeSession] RPC create_stocktake_session error:", error);
    if (error.code === PG_ERR.UNIQUE_VIOLATION) {
      return {
        success: false,
        error: "Chi nhánh này đang có phiên kiểm kê chưa hoàn tất.",
      };
    }
    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }
    return { success: false, error: "Không thể tạo phiên kiểm kê." };
  }

  const result = data as unknown as { id?: number } | null;
  if (!result?.id) {
    return { success: false, error: "Không thể tạo phiên kiểm kê." };
  }
  return { success: true, data: { id: result.id } };
}

/* ─── fetchStocktakeSessions ─── */

export async function fetchStocktakeSessions(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("stocktake_sessions")
    .select(
      "id, session_number, branch_id, location_id, started_at, completed_at, status, notes, created_at, created_by, branches!stocktake_sessions_branch_id_fkey(id, name, branch_kind)",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    query = query.eq("branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[inventory/actions:fetchStocktakeSessions] Fetch stocktake sessions error:", error);
    return { success: false, error: messages.inventory.stocktake.loadFailed };
  }

  const sessions = data ?? [];
  if (sessions.length === 0) {
    return { success: true, data: [] };
  }

  const sessionIds = sessions.map((s) => s.id);
  const { data: lines, error: linesError } = await supabase
    .from("stocktake_lines")
    .select("session_id, counted_quantity")
    .eq("tenant_id", claims.tenant_id)
    .in("session_id", sessionIds);

  if (linesError) {
    console.error("[inventory/actions:fetchStocktakeSessions] Fetch stocktake lines aggregate error:", linesError);
    return { success: false, error: messages.inventory.stocktake.loadFailed };
  }

  const bySession = new Map<number, { total: number; counted: number }>();
  for (const id of sessionIds) {
    bySession.set(id, { total: 0, counted: 0 });
  }

  for (const row of lines ?? []) {
    const sid = Number(row.session_id);
    const agg = bySession.get(sid);
    if (!agg) continue;
    agg.total += 1;
    if (row.counted_quantity != null) {
      agg.counted += 1;
    }
  }

  const enriched = sessions.map((s) => {
    const agg = bySession.get(s.id) ?? { total: 0, counted: 0 };
    const branch = s.branches as {
      id: number;
      name: string;
      branch_kind?: string | null;
    } | null;
    return {
      ...s,
      branches: branch
        ? { ...branch, name: getBranchSiteDisplayName(branch) }
        : branch,
      total_items: agg.total,
      counted_items: agg.counted,
    };
  });

  return { success: true, data: enriched };
}

/* ─── fetchStocktakeDetail ─── */

export async function fetchStocktakeDetail(
  sessionId: number,
): Promise<ActionResult> {
  const parsedId = stocktakeSessionIdSchema.safeParse(sessionId);
  if (!parsedId.success) {
    return { success: false, error: "Mã phiên kiểm kê không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data: session, error: sessionError } = await supabase
    .from("stocktake_sessions")
    .select("*")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (sessionError || !session) {
    if (sessionError) {
      console.error("[inventory/actions:fetchStocktakeDetail] Fetch stocktake session detail error:", sessionError);
    }
    return { success: false, error: messages.inventory.stocktake.detailLoadFailed };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== session.branch_id
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: lines, error: linesError } = await supabase
    .from("stocktake_lines")
    .select("*, ingredients(id, name, category, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code)))")
    .eq("session_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .order("ingredients(name)");

  if (linesError) {
    console.error("[inventory/actions:fetchStocktakeDetail] Fetch stocktake lines error:", linesError);
    return { success: false, error: messages.inventory.stocktake.detailLoadFailed };
  }

  const normalizedLines = (lines ?? []).map((line) => {
    const ingredient = line.ingredients as {
      id: number;
      name: string;
      category: string | null;
    } | null;
    const unit = getEmbeddedIngredientBaseUnitDisplayName(line.ingredients) ?? "";
    return {
      ...line,
      ingredients: ingredient
        ? {
            id: ingredient.id,
            name: ingredient.name,
            category: ingredient.category,
            unit,
          }
        : null,
    };
  });

  return { success: true, data: { session, lines: normalizedLines } };
}

/* ─── updateStocktakeLine ─── */

export const updateStocktakeLine = withAction(
  {
    roles: INVENTORY_OPS_ROLES,
    schema: stocktakeLineUpdateSchema,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    // Fetch the line to get session_id
    const { data: line, error: lineError } = await supabase
      .from("stocktake_lines")
      .select("session_id")
      .eq("id", data.lineId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (lineError || !line) {
      if (lineError) {
        console.error("[inventory/actions:updateStocktakeLine] Fetch line error:", lineError);
      }
      return { success: false, error: "Không thể cập nhật dòng kiểm kê." };
    }

    // Fetch session to verify status
    const { data: session, error: sessionError } = await supabase
      .from("stocktake_sessions")
      .select("status, branch_id")
      .eq("id", line.session_id)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (sessionError || !session) {
      if (sessionError) {
        console.error("[inventory/actions:updateStocktakeLine] Fetch session error:", sessionError);
      }
      return { success: false, error: "Không thể cập nhật dòng kiểm kê." };
    }

    if (session.status !== "in_progress") {
      return {
        success: false,
        error: "Phiên kiểm kê đã hoàn tất hoặc đã hủy.",
      };
    }

    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== session.branch_id
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { error: updateError } = await supabase
      .from("stocktake_lines")
      .update({
        counted_quantity: data.countedQuantity,
        variance_reason: data.varianceReason ?? null,
        reason_code: data.reasonCode ?? null,
      })
      .eq("id", data.lineId)
      .eq("tenant_id", claims.tenant_id);

    if (updateError) {
      console.error("[inventory/actions:updateStocktakeLine] Update stocktake line error:", updateError);
      return { success: false, error: "Không thể cập nhật dòng kiểm kê." };
    }

    return { success: true };
  },
);

/* ─── completeStocktake ─── */

export async function completeStocktake(
  sessionId: number,
): Promise<ActionResult> {
  const parsedId = stocktakeSessionIdSchema.safeParse(sessionId);
  if (!parsedId.success) {
    return { success: false, error: "Mã phiên kiểm kê không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Pre-flight: count uncounted lines before calling the RPC so we don't
  // depend on the RPC's error message text (which can change).
  const { data: uncounted } = await supabase
    .from("stocktake_lines")
    .select("id")
    .eq("session_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .is("counted_quantity", null)
    .limit(1);

  if (uncounted && uncounted.length > 0) {
    return { success: false, error: "Còn nguyên liệu chưa được đếm." };
  }

  const { data: recountLines } = await supabase
    .from("stocktake_lines")
    .select("id")
    .eq("session_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("needs_recount", true)
    .limit(1);

  if (recountLines && recountLines.length > 0) {
    return {
      success: false,
      error: "Còn dòng cần đếm lại trước khi hoàn tất.",
    };
  }

  const { data, error } = await supabase.rpc("complete_stocktake", {
    p_session_id: parsedId.data,
  });

  if (error) {
    console.error("[inventory/actions:completeStocktake] RPC complete_stocktake error:", error);
    const msg = error.message;
    if (msg.includes("uncounted_lines_exist")) {
      return { success: false, error: "Còn nguyên liệu chưa được đếm." };
    }
    if (msg.includes("recount_lines_exist")) {
      return {
        success: false,
        error: "Còn dòng cần đếm lại trước khi hoàn tất.",
      };
    }
    if (msg.includes("session_not_in_progress")) {
      return {
        success: false,
        error: "Phiên kiểm kê không ở trạng thái đang thực hiện.",
      };
    }
    if (msg.includes("stocktake_reason_code_required")) {
      return {
        success: false,
        error:
          "Chọn mã lý do cho mọi dòng có chênh lệch trước khi chốt.",
      };
    }
    if (msg.includes("session_not_found")) {
      return { success: false, error: "Không tìm thấy phiên kiểm kê." };
    }
    return { success: false, error: "Không thể hoàn tất kiểm kê." };
  }

  return { success: true, data };
}

/* ─── cancelStocktake ─── */

export async function cancelStocktake(
  sessionId: number,
): Promise<ActionResult> {
  const parsedId = stocktakeSessionIdSchema.safeParse(sessionId);
  if (!parsedId.success) {
    return { success: false, error: "Mã phiên kiểm kê không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Fetch session to verify status
  const { data: session, error: sessionError } = await supabase
    .from("stocktake_sessions")
    .select("status, branch_id")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (sessionError || !session) {
    if (sessionError) {
      console.error("[inventory/actions:cancelStocktake] Fetch session error:", sessionError);
    }
    return { success: false, error: "Không thể hủy phiên kiểm kê." };
  }

  if (session.status !== "in_progress") {
    return {
      success: false,
      error: "Chỉ có thể hủy phiên kiểm kê đang thực hiện.",
    };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== session.branch_id
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { error: updateError } = await supabase
    .from("stocktake_sessions")
    .update({ status: "cancelled" })
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (updateError) {
    console.error("[inventory/actions:cancelStocktake] Update session to cancelled error:", updateError);
    return { success: false, error: "Không thể hủy phiên kiểm kê." };
  }

  return { success: true };
}
