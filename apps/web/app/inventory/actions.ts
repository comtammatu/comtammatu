"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import { getAuthContext } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import {
  STORAGE_TYPE_BY_LABEL,
  ITEM_KIND_BY_LABEL,
  STORAGE_LABELS,
  ITEM_KIND_LABELS,
  PG_ERR,
} from "./_lib/constants";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";

/* ─── Schemas ─── */

const ingredientSchema = z
  .object({
    name: z.string().min(1, { error: "Tên nguyên liệu không được để trống" }),
    purchase_unit: z
      .string()
      .trim()
      .min(1, { error: "Đơn vị nhập không được để trống" })
      .optional(),
    measure_unit: z
      .string()
      .trim()
      .min(1, { error: "Đơn vị tính không được để trống" })
      .optional(),
    unit: z
      .string()
      .trim()
      .min(1, { error: "Đơn vị không được để trống" })
      .optional(),
    sku: z.string().optional(),
    unit_cost: z.coerce.number().min(0).optional(),
    category: z.string().optional(),
    item_kind: z
      .enum(["raw_material", "finished_good"])
      .default("raw_material"),
    min_stock_level: z.coerce.number().min(0).default(0),
    max_stock_level: z.coerce.number().min(0).optional(),
    reorder_point: z.coerce.number().min(0).optional(),
    storage_type: z
      .enum(["ambient", "refrigerated", "frozen"])
      .default("ambient"),
    shelf_life_days: z.coerce.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const legacyUnit = data.unit?.trim();
    const purchaseUnit = data.purchase_unit?.trim() ?? legacyUnit;
    const measureUnit = data.measure_unit?.trim() ?? legacyUnit;

    if (!purchaseUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchase_unit"],
        message: "Đơn vị nhập không được để trống",
      });
    }

    if (!measureUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["measure_unit"],
        message: "Đơn vị tính không được để trống",
      });
    }
  });

function resolveMeasureUnit(input: Partial<z.infer<typeof ingredientSchema>>) {
  return input.measure_unit?.trim() || input.unit?.trim() || null;
}

function resolvePurchaseUnit(input: Partial<z.infer<typeof ingredientSchema>>) {
  return input.purchase_unit?.trim() || input.unit?.trim() || null;
}

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

export const createIngredient = withAction(
  { roles: INVENTORY_CATALOG_ROLES, schema: ingredientSchema },
  async (data, { supabase, claims }) => {
    const measureUnit = resolveMeasureUnit(data);
    const purchaseUnit = resolvePurchaseUnit(data) ?? measureUnit;

    if (!measureUnit || !purchaseUnit) {
      return { success: false, error: "Thiếu đơn vị nguyên liệu." };
    }

    const { data: result, error } = await supabase
      .from("ingredients")
      .insert({
        tenant_id: claims.tenant_id,
        ...data,
        purchase_unit: purchaseUnit,
        measure_unit: measureUnit,
        unit: measureUnit,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Nguyên liệu này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo nguyên liệu." };
    }

    return { success: true, data: result };
  },
);

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

  const normalizedInput: Partial<z.infer<typeof ingredientSchema>> = {
    ...parsedInput.data,
  };
  const measureUnit = resolveMeasureUnit(parsedInput.data);
  const purchaseUnit = resolvePurchaseUnit(parsedInput.data);

  if (measureUnit) {
    normalizedInput.measure_unit = measureUnit;
    normalizedInput.unit = measureUnit;
  } else {
    delete normalizedInput.measure_unit;
    delete normalizedInput.unit;
  }

  if (purchaseUnit) {
    normalizedInput.purchase_unit = purchaseUnit;
  } else {
    delete normalizedInput.purchase_unit;
  }

  const { error } = await supabase
    .from("ingredients")
    .update(normalizedInput)
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    if (error.code === PG_ERR.UNIQUE_VIOLATION) {
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

export const adjustStock = withAction(
  { roles: INVENTORY_OPS_ROLES, schema: adjustSchema },
  async (data, { supabase, claims, user }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const defaultLocationId = await resolveDefaultInventoryLocation(
      supabase,
      claims.tenant_id,
      data.branchId,
      "issue",
    );

    const { error } = await supabase.from("stock_movements").insert({
      tenant_id: claims.tenant_id,
      branch_id: data.branchId,
      ingredient_id: data.ingredientId,
      type: data.type,
      quantity_change: data.quantityChange,
      reason: data.reason ?? null,
      created_by: user.id,
      location_id: defaultLocationId,
    });

    if (error) {
      if (error.code === PG_ERR.CHECK_VIOLATION) {
        return {
          success: false,
          error: "Không thể điều chỉnh tồn kho do vi phạm ràng buộc dữ liệu.",
        };
      }
      return { success: false, error: "Không thể điều chỉnh tồn kho." };
    }

    return { success: true };
  },
);

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

  const { data, error } = await supabase.rpc("create_stocktake_session", {
    p_branch_id: parsedBranch.data,
    p_location_id: defaultLocationId ?? undefined,
  });

  if (error) {
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
      "id, branch_id, location_id, started_at, completed_at, status, notes, created_at, created_by, branches(id, name)",
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
    return { success: false, error: "Không thể tải danh sách kiểm kê." };
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
    const agg = bySession.get(s.id) ?? { total: 0, counted: 0 };
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

export const updateStocktakeLine = withAction(
  { roles: INVENTORY_OPS_ROLES, schema: stocktakeLineUpdateSchema },
  async (data, { supabase, claims }) => {
    // Fetch the line to get session_id
    const { data: line, error: lineError } = await supabase
      .from("stocktake_lines")
      .select("session_id")
      .eq("id", data.lineId)
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
        counted_quantity: data.countedQuantity,
        variance_reason: data.varianceReason ?? null,
      })
      .eq("id", data.lineId)
      .eq("tenant_id", claims.tenant_id);

    if (updateError) {
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
    return { success: false, error: "ID không hợp lệ" };
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

/* ─── Export / Import Ingredients ─── */

function buildIngredientSheets(
  rows: {
    name: string;
    sku: string | null;
    purchase_unit: string;
    measure_unit: string;
    category: string | null;
    item_kind: string;
    unit_cost: number | null;
    min_stock_level: number;
    max_stock_level: number | null;
    reorder_point: number | null;
    storage_type: string;
    shelf_life_days: number | null;
    is_active: boolean;
  }[],
): SheetDef[] {
  return [
    {
      name: "Nguyen lieu",
      columns: [
        { header: "Tên nguyên liệu", key: "name", width: 32 },
        { header: "SKU", key: "sku", width: 14 },
        { header: "Đơn vị nhập", key: "purchase_unit", width: 14 },
        { header: "Đơn vị tính", key: "measure_unit", width: 14 },
        { header: "Danh mục", key: "category", width: 18 },
        { header: "Loại hàng", key: "item_kind_label", width: 16 },
        { header: "Giá nhập (VND)", key: "unit_cost", width: 16 },
        { header: "Tồn tối thiểu", key: "min_stock_level", width: 14 },
        { header: "Tồn tối đa", key: "max_stock_level", width: 14 },
        { header: "Điểm đặt hàng", key: "reorder_point", width: 14 },
        { header: "Bảo quản", key: "storage_label", width: 14 },
        { header: "Hạn dùng (ngày)", key: "shelf_life_days", width: 14 },
        { header: "Hoạt động", key: "is_active", width: 12 },
      ],
      rows: rows.map((r) => ({
        name: r.name,
        sku: r.sku ?? "",
        purchase_unit: r.purchase_unit,
        measure_unit: r.measure_unit,
        category: r.category ?? "",
        item_kind_label: ITEM_KIND_LABELS[r.item_kind] ?? r.item_kind,
        unit_cost: r.unit_cost ?? "",
        min_stock_level: r.min_stock_level,
        max_stock_level: r.max_stock_level ?? "",
        reorder_point: r.reorder_point ?? "",
        storage_label: STORAGE_LABELS[r.storage_type] ?? r.storage_type,
        shelf_life_days: r.shelf_life_days ?? "",
        is_active: r.is_active ? "Có" : "Không",
      })),
    },
  ];
}

type ExportIngredientsResult =
  | {
      success: true;
      data: { filename: string; base64: string; format: "xlsx" | "csv" };
    }
  | { success: false; error: string };

export async function exportIngredients(
  format: "xlsx" | "csv" = "xlsx",
): Promise<ExportIngredientsResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("ingredients")
    .select(
      "name, sku, purchase_unit, measure_unit, category, item_kind, unit_cost, min_stock_level, max_stock_level, reorder_point, storage_type, shelf_life_days, is_active",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải nguyên liệu." };
  }

  const rows = (data ?? []).map((r) => ({
    name: r.name,
    sku: r.sku,
    purchase_unit: r.purchase_unit ?? "",
    measure_unit: r.measure_unit ?? "",
    category: r.category,
    item_kind: r.item_kind ?? "raw_material",
    unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
    min_stock_level: Number(r.min_stock_level ?? 0),
    max_stock_level: r.max_stock_level != null ? Number(r.max_stock_level) : null,
    reorder_point: r.reorder_point != null ? Number(r.reorder_point) : null,
    storage_type: r.storage_type ?? "ambient",
    shelf_life_days: r.shelf_life_days,
    is_active: r.is_active ?? true,
  }));

  const sheets = buildIngredientSheets(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = buildCsv(sheets[0]!);
    return {
      success: true,
      data: {
        filename: `nguyen-lieu-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `nguyen-lieu-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

const importIngredientRowSchema = z.object({
  name: z.string().trim().min(1, { error: "Thiếu tên" }),
  sku: z.string().trim().optional(),
  purchase_unit: z.string().trim().min(1, { error: "Thiếu đơn vị nhập" }),
  measure_unit: z.string().trim().min(1, { error: "Thiếu đơn vị tính" }),
  category: z.string().trim().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]).default("raw_material"),
  unit_cost: z.coerce.number().min(0).optional(),
  min_stock_level: z.coerce.number().min(0).default(0),
  max_stock_level: z.coerce.number().min(0).optional(),
  reorder_point: z.coerce.number().min(0).optional(),
  storage_type: z.enum(["ambient", "refrigerated", "frozen"]).default("ambient"),
  shelf_life_days: z.coerce.number().int().positive().optional(),
  is_active: z.boolean().default(true),
});

function parseBool(raw: string | undefined): boolean {
  if (!raw) return true;
  const s = raw.trim().toLowerCase();
  if (["", "có", "co", "true", "1", "yes", "x"].includes(s)) return true;
  if (["không", "khong", "false", "0", "no"].includes(s)) return false;
  return true;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const s = raw.toString().trim().replace(/[,\s]/g, "");
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface ImportIngredientIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportIngredientSummary {
  inserted: number;
  updated: number;
}

type ImportIngredientsResult =
  | {
      success: true;
      data: { summary: ImportIngredientSummary };
    }
  | { success: false; error: string; issues?: ImportIngredientIssue[] };

export async function importIngredients(
  formData: FormData,
): Promise<ImportIngredientsResult> {
  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Thiếu file để import" };
  }

  let parsed;
  try {
    parsed = await parseSpreadsheetFile(file, {
      maxRowsPerSheet: MAX_ROWS_PER_SHEET,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không đọc được file",
    };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "File trống" };
  }

  const { supabase, claims } = ctx;

  const issues: ImportIngredientIssue[] = [];
  const toUpsert: {
    tenant_id: number;
    name: string;
    sku: string | null;
    purchase_unit: string;
    measure_unit: string;
    unit: string;
    category: string | null;
    item_kind: "raw_material" | "finished_good";
    unit_cost: number | null;
    min_stock_level: number;
    max_stock_level: number | null;
    reorder_point: number | null;
    storage_type: "ambient" | "refrigerated" | "frozen";
    shelf_life_days: number | null;
    is_active: boolean;
  }[] = [];

  sheet.rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;

    const storageRaw = raw["Bảo quản"] ?? raw["storage_type"] ?? "ambient";
    const storageKey = STORAGE_TYPE_BY_LABEL[storageRaw.trim().toLowerCase()];
    if (!storageKey) {
      issues.push({
        row: rowNumber,
        field: "Bảo quản",
        message: `Kiểu bảo quản không hợp lệ: "${storageRaw}"`,
      });
      return;
    }

    const kindRaw = raw["Loại hàng"] ?? raw["item_kind"] ?? "raw_material";
    const kindKey = ITEM_KIND_BY_LABEL[kindRaw.trim().toLowerCase()];
    if (!kindKey) {
      issues.push({
        row: rowNumber,
        field: "Loại hàng",
        message: `Loại hàng không hợp lệ: "${kindRaw}"`,
      });
      return;
    }

    const unitCost = parseOptionalNumber(
      raw["Giá nhập (VND)"] ?? raw["unit_cost"],
    );
    const maxStock = parseOptionalNumber(
      raw["Tồn tối đa"] ?? raw["max_stock_level"],
    );
    const reorder = parseOptionalNumber(
      raw["Điểm đặt hàng"] ?? raw["reorder_point"],
    );
    const shelfLife = parseOptionalNumber(
      raw["Hạn dùng (ngày)"] ?? raw["shelf_life_days"],
    );

    const parsedRow = importIngredientRowSchema.safeParse({
      name: raw["Tên nguyên liệu"] ?? raw["name"],
      sku: (raw["SKU"] ?? raw["sku"] ?? "").trim() || undefined,
      purchase_unit: raw["Đơn vị nhập"] ?? raw["purchase_unit"],
      measure_unit: raw["Đơn vị tính"] ?? raw["measure_unit"],
      category: (raw["Danh mục"] ?? raw["category"] ?? "").trim() || undefined,
      item_kind: kindKey,
      unit_cost: unitCost,
      min_stock_level: parseOptionalNumber(
        raw["Tồn tối thiểu"] ?? raw["min_stock_level"],
      ) ?? 0,
      max_stock_level: maxStock,
      reorder_point: reorder,
      storage_type: storageKey,
      shelf_life_days: shelfLife,
      is_active: parseBool(raw["Hoạt động"] ?? raw["is_active"]),
    });

    if (!parsedRow.success) {
      issues.push({
        row: rowNumber,
        field: parsedRow.error.issues[0]?.path.join("."),
        message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      });
      return;
    }

    const d = parsedRow.data;
    toUpsert.push({
      tenant_id: claims.tenant_id,
      name: d.name,
      sku: d.sku ?? null,
      purchase_unit: d.purchase_unit,
      measure_unit: d.measure_unit,
      unit: d.measure_unit,
      category: d.category ?? null,
      item_kind: d.item_kind,
      unit_cost: d.unit_cost ?? null,
      min_stock_level: d.min_stock_level,
      max_stock_level: d.max_stock_level ?? null,
      reorder_point: d.reorder_point ?? null,
      storage_type: d.storage_type,
      shelf_life_days: d.shelf_life_days ?? null,
      is_active: d.is_active,
    });
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng lỗi. Vui lòng sửa và thử lại.`,
      issues,
    };
  }

  if (toUpsert.length === 0) {
    return { success: false, error: "Không có dòng hợp lệ nào để import" };
  }

  const { data: existing } = await supabase
    .from("ingredients")
    .select("name, sku")
    .eq("tenant_id", claims.tenant_id);
  const existingNames = new Set((existing ?? []).map((r) => r.name));
  const skuToExistingName = new Map<string, string>();
  for (const r of existing ?? []) {
    if (r.sku) skuToExistingName.set(r.sku, r.name);
  }

  // Detect row-level SKU conflicts: incoming row's SKU matches an existing
  // ingredient with a DIFFERENT name (a rename + SKU collision would silently
  // fail at the DB level otherwise because our upsert matches on name).
  const seenSkuInBatch = new Map<string, number>();
  toUpsert.forEach((row, idx) => {
    const rowNumber = idx + 2;
    if (!row.sku) return;
    const dupIdx = seenSkuInBatch.get(row.sku);
    if (dupIdx != null) {
      issues.push({
        row: rowNumber,
        field: "SKU",
        message: `SKU "${row.sku}" trùng với dòng ${dupIdx} trong file.`,
      });
      return;
    }
    seenSkuInBatch.set(row.sku, rowNumber);
    const existingName = skuToExistingName.get(row.sku);
    if (existingName && existingName !== row.name) {
      issues.push({
        row: rowNumber,
        field: "SKU",
        message: `SKU "${row.sku}" đã thuộc về nguyên liệu "${existingName}". Đổi SKU hoặc dùng đúng tên.`,
      });
    }
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng SKU trùng. Vui lòng sửa và thử lại.`,
      issues,
    };
  }

  const { error } = await supabase
    .from("ingredients")
    .upsert(toUpsert, { onConflict: "name,tenant_id" });

  if (error) {
    if (error.code === PG_ERR.UNIQUE_VIOLATION) {
      return {
        success: false,
        error: "Trùng dữ liệu với nguyên liệu đang có. Vui lòng kiểm tra tên và SKU.",
      };
    }
    return { success: false, error: "Không thể ghi dữ liệu nguyên liệu." };
  }

  const summary: ImportIngredientSummary = { inserted: 0, updated: 0 };
  for (const row of toUpsert) {
    if (existingNames.has(row.name)) summary.updated += 1;
    else summary.inserted += 1;
  }

  return { success: true, data: { summary } };
}

export async function downloadIngredientTemplate(): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildIngredientSheets([
    {
      name: "Sườn cốt lết (ví dụ)",
      sku: "SL-001",
      purchase_unit: "kg",
      measure_unit: "kg",
      category: "Thịt",
      item_kind: "raw_material",
      unit_cost: 180000,
      min_stock_level: 10,
      max_stock_level: 100,
      reorder_point: 20,
      storage_type: "refrigerated",
      shelf_life_days: 3,
      is_active: true,
    },
  ]);

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: "nguyen-lieu-template.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx" as const,
    },
  };
}
