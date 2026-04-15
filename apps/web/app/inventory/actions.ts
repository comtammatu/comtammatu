"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import { getAuthContext } from "./_lib/auth";
import {
  resolveDefaultInventoryLocation,
  withInventoryLocationCompatFallback,
} from "./_lib/inventory-location-compat";

/* ─── Schemas ─── */

const ingredientSchema = z.object({
  name: z.string().min(1, { error: "Tên nguyên liệu không được để trống" }),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  sku: z.string().optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  category: z.string().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]).default("raw_material"),
  min_stock_level: z.coerce.number().min(0).default(0),
  max_stock_level: z.coerce.number().min(0).optional(),
  reorder_point: z.coerce.number().min(0).optional(),
  storage_type: z
    .enum(["ambient", "refrigerated", "frozen"])
    .default("ambient"),
  shelf_life_days: z.coerce.number().int().positive().optional(),
});

/* ─── fetchIngredients (full catalog — SM quản lý danh mục; ops xem theo nghiệp vụ) ─── */

export async function fetchIngredients(limit = 2000): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);

  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("name")
    .limit(safeLimit);

  if (error) {
    return { success: false, error: "Không thể tải danh sách nguyên liệu." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── createIngredient ─── */

export async function createIngredient(
  input: z.infer<typeof ingredientSchema>,
): Promise<ActionResult> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      tenant_id: claims.tenant_id,
      ...parsed.data,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Nguyên liệu này đã tồn tại." };
    }
    return { success: false, error: "Không thể tạo nguyên liệu." };
  }

  return { success: true, data };
}

/* ─── updateIngredient ─── */

export async function updateIngredient(
  id: number,
  input: Partial<z.infer<typeof ingredientSchema>>,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const updateSchema = ingredientSchema.partial();
  const parsedInput = updateSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("ingredients")
    .update(parsedInput.data)
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "Tên hoặc mã nguyên liệu đã tồn tại.",
      };
    }
    return { success: false, error: "Không thể cập nhật nguyên liệu." };
  }

  return { success: true };
}

/* ─── fetchStockLevels ─── */

export async function fetchStockLevels(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_levels")
    .select(
      `
      id,
      current_quantity,
      avg_unit_cost,
      last_counted_at,
      ingredient_id,
      ingredients (
        id, name, unit, category, min_stock_level, max_stock_level, is_active
      )
    `,
    )
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể tải tồn kho." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── adjustStock ─── */

const adjustSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantityChange: z.coerce.number(),
  type: z.enum(["adjustment", "count_adjustment"]),
  reason: z.string().optional(),
});

export async function adjustStock(
  input: z.infer<typeof adjustSchema>,
): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsed.data.branchId
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const defaultLocationId = await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    parsed.data.branchId,
    "issue",
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- location columns are compatibility-prep before db:types regenerate
  const sb = supabase as any;
  const basePayload = {
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branchId,
    ingredient_id: parsed.data.ingredientId,
    type: parsed.data.type,
    quantity_change: parsed.data.quantityChange,
    reason: parsed.data.reason ?? null,
    created_by: user.id,
  };

  const { error } = await withInventoryLocationCompatFallback(
    () =>
      sb.from("stock_movements").insert({
        ...basePayload,
        location_id: defaultLocationId,
      }),
    () => sb.from("stock_movements").insert(basePayload),
  );

  if (error) {
    if (error.code === "23514") {
      return {
        success: false,
        error: "Không thể điều chỉnh tồn kho do vi phạm ràng buộc dữ liệu.",
      };
    }
    return { success: false, error: "Không thể điều chỉnh tồn kho." };
  }

  return { success: true };
}

/* ─── fetchStockAlerts ─── */

export async function fetchStockAlerts(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_levels")
    .select(
      `
      id, current_quantity, ingredient_id,
      ingredients (
        id, name, unit, min_stock_level, max_stock_level, is_active
      )
    `,
    )
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể tải cảnh báo tồn kho." };
  }

  const alerts = (data ?? []).filter((sl) => {
    const ing = sl.ingredients as unknown as {
      min_stock_level: number;
      max_stock_level: number | null;
      is_active: boolean;
    } | null;
    if (!ing || !ing.is_active) return false;
    if (sl.current_quantity < ing.min_stock_level) return true;
    if (ing.max_stock_level && sl.current_quantity > ing.max_stock_level)
      return true;
    return false;
  });

  return { success: true, data: alerts };
}

/* ─── Stocktake Schemas ─── */

const stocktakeSessionIdSchema = z.coerce.number().int().positive();
const stocktakeLineUpdateSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  countedQuantity: z.coerce.number().min(0),
  varianceReason: z.string().optional(),
});

/* ─── Stocktake Actions ─── */

export async function createStocktakeSession(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsedBranch.data
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const defaultLocationId = await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    parsedBranch.data,
    "receive",
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- compatibility RPC payload before db:types regenerate
  const sb = supabase as any;
  const { data, error } = await withInventoryLocationCompatFallback(
    () =>
      sb.rpc("create_stocktake_session", {
        p_branch_id: parsedBranch.data,
        p_location_id: defaultLocationId,
      }),
    () =>
      sb.rpc("create_stocktake_session", {
        p_branch_id: parsedBranch.data,
      }),
  );

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "Chi nhánh này đang có phiên kiểm kê chưa hoàn tất.",
      };
    }
    if (error.code === "42501") {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- location columns are compatibility-prep before db:types regenerate
  const sb = supabase as any;
  const buildQuery = (selectClause: string) => {
    let query = sb
      .from("stocktake_sessions")
      .select(selectClause)
      .eq("tenant_id", claims.tenant_id)
      .order("created_at", { ascending: false });

    if (claims.user_role === "branch_manager" && claims.branch_id != null) {
      query = query.eq("branch_id", claims.branch_id);
    } else if (branchId) {
      query = query.eq("branch_id", branchId);
    }
    return query;
  };

  const { data, error } = await withInventoryLocationCompatFallback(
    () =>
      buildQuery(
        "id, branch_id, location_id, started_at, completed_at, status, notes, created_at, created_by, branches(id, name)",
      ),
    () =>
      buildQuery(
        "id, branch_id, started_at, completed_at, status, notes, created_at, created_by, branches(id, name)",
      ),
  );

  if (error) {
    return { success: false, error: "Không thể tải danh sách kiểm kê." };
  }

  const sessions = (data ?? []) as Array<Record<string, unknown>>;
  if (sessions.length === 0) {
    return { success: true, data: [] };
  }

  const sessionIds = sessions.map((s) => Number(s.id)).filter(Number.isFinite);
  const { data: lines, error: linesError } = await supabase
    .from("stocktake_lines")
    .select("session_id, counted_quantity")
    .eq("tenant_id", claims.tenant_id)
    .in("session_id", sessionIds);

  if (linesError) {
    return { success: false, error: "Không thể tải danh sách kiểm kê." };
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
    const sid = Number(s.id);
    const agg = bySession.get(sid) ?? { total: 0, counted: 0 };
    return {
      ...s,
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
    return { success: false, error: "ID không hợp lệ" };
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
    return { success: false, error: "Không thể tải chi tiết kiểm kê." };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== session.branch_id
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: lines, error: linesError } = await supabase
    .from("stocktake_lines")
    .select("*, ingredients(id, name, unit, category)")
    .eq("session_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .order("ingredients(name)");

  if (linesError) {
    return { success: false, error: "Không thể tải chi tiết kiểm kê." };
  }

  return { success: true, data: { session, lines: lines ?? [] } };
}

/* ─── updateStocktakeLine ─── */

export async function updateStocktakeLine(
  input: z.infer<typeof stocktakeLineUpdateSchema>,
): Promise<ActionResult> {
  const parsed = stocktakeLineUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Fetch the line to get session_id
  const { data: line, error: lineError } = await supabase
    .from("stocktake_lines")
    .select("session_id")
    .eq("id", parsed.data.lineId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (lineError || !line) {
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
      counted_quantity: parsed.data.countedQuantity,
      variance_reason: parsed.data.varianceReason ?? null,
    })
    .eq("id", parsed.data.lineId)
    .eq("tenant_id", claims.tenant_id);

  if (updateError) {
    return { success: false, error: "Không thể cập nhật dòng kiểm kê." };
  }

  return { success: true };
}

/* ─── completeStocktake ─── */

export async function completeStocktake(
  sessionId: number,
): Promise<ActionResult> {
  const parsedId = stocktakeSessionIdSchema.safeParse(sessionId);
  if (!parsedId.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("complete_stocktake", {
    p_session_id: parsedId.data,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes("uncounted_lines_exist")) {
      return { success: false, error: "Còn nguyên liệu chưa được đếm." };
    }
    if (msg.includes("session_not_in_progress")) {
      return {
        success: false,
        error: "Phiên kiểm kê không ở trạng thái đang thực hiện.",
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
    return { success: false, error: "ID không hợp lệ" };
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
    return { success: false, error: "Không thể hủy phiên kiểm kê." };
  }

  return { success: true };
}

/* ─── Alert Actions ─── */

export async function fetchExpiryAlerts(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("grn_items")
    .select(
      `
      batch_number,
      expiry_date,
      goods_received_notes!inner (
        branch_id,
        grn_number,
        status,
        branches ( name )
      ),
      ingredients ( id, name )
    `,
    )
    .eq("goods_received_notes.status", "confirmed")
    .not("expiry_date", "is", null)
    .lte(
      "expiry_date",
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .eq("tenant_id", claims.tenant_id)
    .order("expiry_date", { ascending: true });

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    query = query.eq("goods_received_notes.branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải cảnh báo hạn sử dụng." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts = (data ?? [])
    .filter((item) => {
      // Skip items where ingredient join failed — write-off requires valid ingredient_id
      const ing = item.ingredients as unknown as { id: number } | null;
      return ing != null && ing.id > 0;
    })
    .map((item) => {
      const expiryDate = new Date(item.expiry_date as string);
      expiryDate.setHours(0, 0, 0, 0);
      const daysRemaining = Math.ceil(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const grn = item.goods_received_notes as unknown as {
        grn_number: string;
        branch_id: number;
        branches: { name: string } | null;
      };

      let urgency: "expired" | "critical" | "warning";
      if (daysRemaining <= 0) {
        urgency = "expired";
      } else if (daysRemaining <= 3) {
        urgency = "critical";
      } else {
        urgency = "warning";
      }

      const ingredient = item.ingredients as unknown as {
        id: number;
        name: string;
      };

      return {
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.name,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        grn_number: grn.grn_number,
        branch_id: grn.branch_id,
        branch_name: grn.branches?.name ?? "",
        days_remaining: daysRemaining,
        urgency,
      };
    });

  return { success: true, data: alerts };
}

/* ─── fetchReorderAlerts ─── */

export async function fetchReorderAlerts(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("stock_levels")
    .select(
      `
      current_quantity,
      branch_id,
      branches ( name ),
      ingredients!inner (
        id, name, unit, reorder_point, max_stock_level, is_active
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("ingredients.is_active", true)
    .not("ingredients.reorder_point", "is", null);

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    query = query.eq("branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải cảnh báo đặt hàng." };
  }

  const alerts = (data ?? [])
    .filter((sl) => {
      const ing = sl.ingredients as unknown as {
        reorder_point: number | null;
      } | null;
      if (!ing || ing.reorder_point == null) return false;
      return sl.current_quantity <= ing.reorder_point;
    })
    .map((sl) => {
      const ing = sl.ingredients as unknown as {
        id: number;
        name: string;
        unit: string;
        reorder_point: number;
        max_stock_level: number | null;
      };
      const maxStock = ing.max_stock_level ?? 0;
      const suggestedQty = Math.max(0, maxStock - sl.current_quantity);

      return {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.unit,
        current_quantity: sl.current_quantity,
        reorder_point: ing.reorder_point,
        max_stock_level: ing.max_stock_level,
        suggested_order_qty: suggestedQty,
        branch_id: sl.branch_id,
        branch_name:
          (sl.branches as unknown as { name: string } | null)?.name ?? "",
      };
    })
    .sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

  return { success: true, data: alerts };
}
