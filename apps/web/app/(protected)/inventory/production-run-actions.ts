"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import {
  getAuthContextWithAnyPermission,
} from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "./_lib/constants";

import type { ProductionShortageRow } from "./production-types";
import {
  isProductionSiteScopedRole,
  PRODUCTION_ROLES,
  requireProductionAccess,
} from "./_lib/production-shared";

const PRODUCTION_ORDER_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
] as const;

const createProductionRunSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  finishedGoodId: z.coerce.number().int().positive(),
  plannedQuantity: z.coerce.number().positive(),
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
  targetBranchId: z.coerce.number().int().positive().optional(),
  ingredientsOverride: z.array(z.object({
    ingredient_id: z.coerce.number().int().positive(),
    actual_quantity: z.coerce.number().nonnegative(),
  })).optional(),
});

const productionShortageListSchema = z.array(
  z.object({
    ingredient_id: z.coerce.number().int().positive(),
    ingredient_name: z.string(),
    unit: z.string(),
    needed: z.coerce.number(),
    on_hand: z.coerce.number(),
  })
);

function parseShortagesDetail(details: string | null | undefined): ProductionShortageRow[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    const result = productionShortageListSchema.safeParse(parsed);
    if (result.success) {
        // Need to add `missing` field which might be required by UI
        return result.data.map(d => ({
            ...d,
            missing: d.needed - d.on_hand
        }));
    }
    return [];
  } catch {
    return [];
  }
}

export interface ProductionRunRow {
  id: number;
  branch_id: number;
  branch_name: string;
  target_branch_id: number;
  target_branch_name: string;
  production_number: string;
  finished_good_id: number;
  finished_good_name: string;
  planned_quantity: number;
  actual_quantity: number | null;
  entry_unit_id: number | null;
  entry_unit_name: string | null;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  started_at: string | null;
  ingredients_override: any;
}

export async function fetchProductionRuns(): Promise<ActionResult<ProductionRunRow[]>> {
  const ctx = await getAuthContextWithAnyPermission(PRODUCTION_ROLES, PRODUCTION_ORDER_PERMISSIONS);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const access = await requireProductionAccess(supabase, claims);
  if (!access.ok) return { success: false, error: access.error };

  let query = supabase
    .from("production_runs")
    .select(`
      id,
      branch_id,
      production_number,
      finished_good_id,
      planned_quantity,
      actual_quantity,
      entry_unit_id,
      status,
      notes,
      completed_at,
      created_at,
      started_at,
      target_branch_id,
      ingredients_override,
      branches!production_runs_branch_id_fkey ( id, name, branch_kind ),
      target_branch:branches!production_runs_target_branch_id_fkey ( id, name, branch_kind ),
      ingredients!inner (
        id,
        name,
        ingredient_units!ingredient_units_ingredient_tenant_fkey (
          is_base,
          units!ingredient_units_unit_tenant_fkey ( name )
        )
      ),
      units ( id, name )
    `)
    .eq("tenant_id", claims.tenant_id)
    .in("branches.branch_kind", ["central_kitchen", "branch"])
    .order("created_at", { ascending: false });

  if (isProductionSiteScopedRole(claims.user_role) && claims.branch_id != null) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchProductionRuns error:", error);
    return { success: false, error: "Lỗi tải danh sách Lệnh sản xuất" };
  }

  const rows: ProductionRunRow[] = (data || []).map((row: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => ({
    id: row.id,
    branch_id: row.branch_id,
    branch_name: row.branches?.name ?? "Unknown",
    target_branch_id: row.target_branch_id ?? row.branch_id,
    target_branch_name: (row as any).target_branch?.name ?? row.branches?.name ?? "Unknown",
    production_number: row.production_number,
    finished_good_id: row.finished_good_id,
    finished_good_name: row.ingredients?.name ?? "Unknown",
    planned_quantity: Number(row.planned_quantity),
    actual_quantity: row.actual_quantity != null ? Number(row.actual_quantity) : null,
    entry_unit_id: row.entry_unit_id,
    entry_unit_name: row.units?.name ??
      (row.ingredients as any)?.ingredient_units?.find((u: any) => u.is_base)?.units?.name ??
      null,
    status: row.status,
    notes: row.notes,
    completed_at: row.completed_at,
    created_at: row.created_at,
    started_at: row.started_at,
    ingredients_override: row.ingredients_override,
  }));

  return { success: true, data: rows };
}

export async function fetchProductionRunById(id: number): Promise<ActionResult<ProductionRunRow>> {
  const ctx = await getAuthContextWithAnyPermission(PRODUCTION_ROLES, PRODUCTION_ORDER_PERMISSIONS);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const access = await requireProductionAccess(supabase, claims);
  if (!access.ok) return { success: false, error: access.error };

  const { data, error } = await supabase
    .from("production_runs")
    .select(`
      id,
      branch_id,
      production_number,
      finished_good_id,
      planned_quantity,
      actual_quantity,
      entry_unit_id,
      status,
      notes,
      completed_at,
      created_at,
      started_at,
      target_branch_id,
      ingredients_override,
      branches!production_runs_branch_id_fkey ( id, name, branch_kind ),
      target_branch:branches!production_runs_target_branch_id_fkey ( id, name, branch_kind ),
      ingredients!inner (
        id,
        name,
        ingredient_units!ingredient_units_ingredient_tenant_fkey (
          is_base,
          units!ingredient_units_unit_tenant_fkey ( name )
        )
      ),
      units ( id, name )
    `)
    .eq("tenant_id", claims.tenant_id)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Không tìm thấy Lệnh sản xuất" };
  }

  const row: ProductionRunRow = {
    id: data.id,
    branch_id: data.branch_id,
    branch_name: data.branches?.name ?? "Unknown",
    target_branch_id: data.target_branch_id ?? data.branch_id,
    target_branch_name: (data as any).target_branch?.name ?? data.branches?.name ?? "Unknown",
    production_number: data.production_number,
    finished_good_id: data.finished_good_id,
    finished_good_name: data.ingredients?.name ?? "Unknown",
    planned_quantity: Number(data.planned_quantity),
    actual_quantity: data.actual_quantity != null ? Number(data.actual_quantity) : null,
    entry_unit_id: data.entry_unit_id,
    entry_unit_name: (data as unknown as { units?: { name?: string } }).units?.name ??
      (data as any).ingredients?.ingredient_units?.find((u: any) => u.is_base)?.units?.name ??
      null,
    status: data.status,
    notes: data.notes,
    completed_at: data.completed_at,
    created_at: data.created_at,
    started_at: data.started_at,
    ingredients_override: data.ingredients_override,
  };

  return { success: true, data: row };
}

import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";

export const createProductionRun = withAction(
  {
    schema: createProductionRunSchema,
    roles: INVENTORY_OPS_ROLES,
  },
  async (parsed, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };

    const { count: recipeLineCount, error: recipeCheckError } = await supabase
      .from("production_recipes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("finished_good_id", parsed.finishedGoodId);

    if (recipeCheckError) {
      console.error("createProductionRun recipe check error:", recipeCheckError);
      return { success: false, error: "Lỗi kiểm tra công thức sản xuất" };
    }

    if (!recipeLineCount) {
      return {
        success: false,
        error: "Thành phẩm này chưa có công thức sản xuất.",
      };
    }

    const { error, data } = await supabase.rpc("create_production_run", {
      p_branch_id: parsed.branchId,
      p_finished_good_id: parsed.finishedGoodId,
      p_planned_quantity: parsed.plannedQuantity,
      p_entry_unit_id: (parsed.entryUnitId ?? null) as unknown as number,
      p_notes: (parsed.notes ?? null) as unknown as string,
      p_target_branch_id: (parsed.targetBranchId ?? parsed.branchId) as unknown as number,
      p_ingredients_override: (parsed.ingredientsOverride ?? null) as unknown as any,
    });

    if (error) {
      console.error("createProductionRun error:", error);
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) return { success: false, error: "Không có quyền thực hiện" };
      return { success: false, error: "Lỗi tạo Lệnh sản xuất" };
    }

    return { success: true, data };
  }
);

const confirmProductionRunSchema = z.object({
  id: z.coerce.number().int().positive(),
  actualQuantity: z.coerce.number().positive().optional(),
  actualIngredients: z.array(z.object({
    ingredient_id: z.coerce.number().int().positive(),
    actual_quantity: z.coerce.number().nonnegative(),
  })).optional(),
});

export const confirmProductionRun = withAction(
  {
    schema: confirmProductionRunSchema,
    roles: INVENTORY_OPS_ROLES,
  },
  async (parsed, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };

    const { error, data } = await supabase.rpc("confirm_production_run", {
      p_run_id: parsed.id,
      p_actual_quantity: (parsed.actualQuantity ?? null) as unknown as number,
      p_actual_ingredients: (parsed.actualIngredients ?? null) as unknown as any,
    });

    if (error) {
      console.error("confirmProductionRun error:", error);
      const message = error.message || "";
      
      if (message.includes("production_run_not_found")) {
        return { success: false, error: "Không tìm thấy lệnh" };
      }
      if (message.includes("production_run_not_draft")) {
        return { success: false, error: "Chỉ có thể xác nhận lệnh đang ở trạng thái nháp hoặc đang xử lý." };
      }
      if (message.includes("insufficient_stock_for_production")) {
        const shortages = parseShortagesDetail(error.details);
        return { success: false, error: "Kho không đủ nguyên liệu", data: shortages };
      }
      if (message.includes("production_recipe_missing")) {
        return { success: false, error: "Thiếu công thức sản xuất" };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE || message.includes("forbidden") || message.includes("branch_scope_violation")) {
        return { success: false, error: "Không có quyền thực hiện" };
      }
      return { success: false, error: "Lỗi xác nhận Lệnh sản xuất" };
    }

    return { success: true, data: data as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ };
  }
);

export const cancelProductionRun = withAction(
  {
    schema: z.number().int().positive(),
    roles: INVENTORY_OPS_ROLES,
  },
  async (parsed, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };

    const { error, data } = await supabase.rpc("cancel_production_run", {
      p_run_id: parsed,
    });

    if (error) {
      console.error("cancelProductionRun error:", error);
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) return { success: false, error: "Không có quyền thực hiện" };
      return { success: false, error: "Lỗi hủy Lệnh sản xuất" };
    }

    return { success: true, data };
  }
);

export const startProductionRun = withAction(
  {
    schema: z.number().int().positive(),
    roles: INVENTORY_OPS_ROLES,
  },
  async (parsed, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };

    const { error, data } = await supabase.rpc("start_production_run", {
      p_run_id: parsed,
    });

    if (error) {
      console.error("startProductionRun error:", error);
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) return { success: false, error: "Không có quyền thực hiện" };
      return { success: false, error: "Lỗi bắt đầu Lệnh sản xuất" };
    }

    return { success: true, data };
  }
);

export interface ProductionRecipeIngredient {
  ingredient_id: number;
  ingredient_name: string;
  unit_name: string;
  entry_unit_id: number | null;
  recipe_quantity: number;
  yield_factor: number;
  current_quantity_base: number;
  required_base_per_fg: number;
  max_ingredient_qty: number;
}

export async function fetchProductionRecipeContext(
  finishedGoodId: number,
  branchId: number
): Promise<ActionResult<{ ingredients: ProductionRecipeIngredient[], maxProductionQuantity: number | null }>> {
  const ctx = await getAuthContextWithAnyPermission(PRODUCTION_ROLES, PRODUCTION_ORDER_PERMISSIONS);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const access = await requireProductionAccess(supabase, claims);
  if (!access.ok) return { success: false, error: access.error };

  const { data, error } = await (supabase.rpc as any)("get_production_recipe_context", {
    p_finished_good_id: finishedGoodId,
    p_branch_id: branchId,
  });

  if (error) {
    console.error("fetchProductionRecipeContext error:", error);
    return { success: false, error: "Lỗi lấy thông tin công thức" };
  }

  const ingredients = (data as unknown as ProductionRecipeIngredient[]) || [];
  
  let maxProductionQuantity: number | null = null;
  for (const ing of ingredients) {
    if (ing.required_base_per_fg > 0) {
      const possible = Math.floor((ing.current_quantity_base / ing.required_base_per_fg) * 1000) / 1000;
      if (maxProductionQuantity === null || possible < maxProductionQuantity) {
        maxProductionQuantity = possible;
      }
    }
  }

  return { success: true, data: { ingredients, maxProductionQuantity } };
}
