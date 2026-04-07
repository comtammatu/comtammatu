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

/**
 * Nguyên liệu được phép tại một chi nhánh (theo branch_ingredients).
 * Dùng cho điều chỉnh tồn, luân chuyển, v.v.
 */
export async function fetchIngredientsForBranch(
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

  const { data, error } = await supabase
    .from("branch_ingredients")
    .select(
      `
      ingredient_id,
      ingredients (
        id, name, sku, unit, unit_cost, category, min_stock_level, max_stock_level,
        reorder_point, storage_type, shelf_life_days, is_active
      )
    `,
    )
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return {
      success: false,
      error: "Không thể tải nguyên liệu theo chi nhánh.",
    };
  }

  const rows = (data ?? [])
    .map((r) => r.ingredients)
    .filter((x): x is NonNullable<typeof x> => x != null);

  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return { success: true, data: rows };
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
        error:
          "Nguyên liệu chưa được mở cho chi nhánh này. Liên hệ Trụ sở để cấu hình.",
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
