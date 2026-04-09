"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import { getAuthContext } from "../_lib/auth";

/* ─── Schemas ─── */

const ingredientSchema = z.object({
  name: z.string().min(1, { error: "Tên nguyên liệu không được để trống" }),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  sku: z.string().optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  category: z.string().optional(),
  min_stock_level: z.coerce.number().min(0).default(0),
  max_stock_level: z.coerce.number().min(0).optional(),
  reorder_point: z.coerce.number().min(0).optional(),
  storage_type: z
    .enum(["ambient", "refrigerated", "frozen"])
    .default("ambient"),
  shelf_life_days: z.coerce.number().int().positive().optional(),
});

/* ─── fetchIngredients (full catalog — SM quản lý danh mục; ops xem theo nghiệp vụ) ─── */

export async function fetchIngredients(): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("name");

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

  const { error } = await supabase.from("stock_movements").insert({
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branchId,
    ingredient_id: parsed.data.ingredientId,
    type: parsed.data.type,
    quantity_change: parsed.data.quantityChange,
    reason: parsed.data.reason ?? null,
    created_by: user.id,
  });

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

  const { supabase, claims, user } = ctx;

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== parsedBranch.data
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessionError } = await (
    supabase.from("stocktake_sessions" as any) as any
  )
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsedBranch.data,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (sessionError) {
    if (sessionError.code === "23505") {
      return {
        success: false,
        error: "Chi nhánh này đang có phiên kiểm kê chưa hoàn tất.",
      };
    }
    return { success: false, error: "Không thể tạo phiên kiểm kê." };
  }

  // Fetch current stock levels for this branch
  const { data: stockLevels, error: slError } = await supabase
    .from("stock_levels")
    .select("ingredient_id, current_quantity")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id);

  if (slError) {
    return { success: false, error: "Không thể tạo phiên kiểm kê." };
  }

  // Create stocktake lines for each stock level
  if (stockLevels && stockLevels.length > 0) {
    const lines = stockLevels.map((sl) => ({
      tenant_id: claims.tenant_id,
      session_id: (session as { id: number }).id,
      ingredient_id: sl.ingredient_id,
      system_quantity: sl.current_quantity,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: linesError } = await (
      supabase.from("stocktake_lines" as any) as any
    ).insert(lines);

    if (linesError) {
      return { success: false, error: "Không thể tạo phiên kiểm kê." };
    }
  }

  return { success: true, data: { id: (session as { id: number }).id } };
}

/* ─── fetchStocktakeSessions ─── */

export async function fetchStocktakeSessions(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("stocktake_sessions" as any) as any)
    .select(
      "id, branch_id, started_at, completed_at, status, notes, created_at, created_by, branches(id, name)",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (claims.user_role === "branch_manager") {
    query = query.eq("branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải danh sách kiểm kê." };
  }

  return { success: true, data: data ?? [] };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessionError } = await (
    supabase.from("stocktake_sessions" as any) as any
  )
    .select("*")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (sessionError || !session) {
    return { success: false, error: "Không thể tải chi tiết kiểm kê." };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== (session as { branch_id: number }).branch_id
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lines, error: linesError } = await (
    supabase.from("stocktake_lines" as any) as any
  )
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: line, error: lineError } = await (
    supabase.from("stocktake_lines" as any) as any
  )
    .select("session_id")
    .eq("id", parsed.data.lineId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (lineError || !line) {
    return { success: false, error: "Không thể cập nhật dòng kiểm kê." };
  }

  // Fetch session to verify status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessionError } = await (
    supabase.from("stocktake_sessions" as any) as any
  )
    .select("status, branch_id")
    .eq("id", (line as { session_id: number }).session_id)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (sessionError || !session) {
    return { success: false, error: "Không thể cập nhật dòng kiểm kê." };
  }

  if ((session as { status: string }).status !== "in_progress") {
    return {
      success: false,
      error: "Phiên kiểm kê đã hoàn tất hoặc đã hủy.",
    };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== (session as { branch_id: number }).branch_id
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (
    supabase.from("stocktake_lines" as any) as any
  )
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("complete_stocktake", {
    p_session_id: parsedId.data,
  });

  if (error) {
    const msg = error.message as string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error: sessionError } = await (
    supabase.from("stocktake_sessions" as any) as any
  )
    .select("status, branch_id")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (sessionError || !session) {
    return { success: false, error: "Không thể hủy phiên kiểm kê." };
  }

  if ((session as { status: string }).status !== "in_progress") {
    return {
      success: false,
      error: "Chỉ có thể hủy phiên kiểm kê đang thực hiện.",
    };
  }

  if (
    claims.user_role === "branch_manager" &&
    claims.branch_id !== (session as { branch_id: number }).branch_id
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (
    supabase.from("stocktake_sessions" as any) as any
  )
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
      ingredients ( name )
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

  const alerts = (data ?? []).map((item) => {
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

    return {
      ingredient_name:
        (item.ingredients as unknown as { name: string } | null)?.name ?? "",
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      grn_number: grn.grn_number,
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
