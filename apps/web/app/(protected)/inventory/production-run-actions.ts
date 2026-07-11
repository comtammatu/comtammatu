"use server";

import { z } from "zod";
import type { Json } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithAnyPermission } from "./_lib/auth";
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

const PRODUCTION_RECIPE_UNIT_MAPPING_ERROR =
  "Đơn vị nguyên liệu trong công thức chưa hợp lệ. Hãy cập nhật công thức trước khi tạo hoặc xác nhận lệnh.";
const PRODUCTION_RUN_UNIT_MAPPING_REVIEW_ERROR =
  "Lệnh này được tạo trước khi đơn vị nguyên liệu được sửa. Hãy đối chiếu nguyên liệu thực tế rồi hủy và tạo lại lệnh trước khi xác nhận.";

const createProductionRunSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  sourceLocationId: z.coerce.number().int().positive().optional(),
  finishedGoodId: z.coerce.number().int().positive(),
  plannedQuantity: z.coerce.number().positive(),
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
  targetBranchId: z.coerce.number().int().positive().optional(),
  targetLocationId: z.coerce.number().int().positive().optional(),
  ingredientsOverride: z
    .array(
      z.object({
        ingredient_id: z.coerce.number().int().positive(),
        actual_quantity: z.coerce.number().nonnegative(),
      }),
    )
    .optional(),
});

const recordProductionRunSchema = createProductionRunSchema.extend({
  actualQuantity: z.coerce.number().positive(),
});

const productionShortageListSchema = z.array(
  z.object({
    ingredient_id: z.coerce.number().int().positive(),
    ingredient_name: z.string(),
    unit: z.string(),
    needed: z.coerce.number(),
    on_hand: z.coerce.number(),
  }),
);

function parseShortagesDetail(
  details: string | null | undefined,
): ProductionShortageRow[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    const result = productionShortageListSchema.safeParse(parsed);
    if (result.success) {
      // Need to add `missing` field which might be required by UI
      return result.data.map((d) => ({
        ...d,
        missing: d.needed - d.on_hand,
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
  entry_unit_to_base_factor: number | null;
  source_location_id: number | null;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  started_at: string | null;
  ingredients_override: ProductionIngredientOverride[] | null;
}

export type ProductionIngredientOverride = {
  ingredient_id: number;
  actual_quantity: number;
};

type CreateProductionRunResult = {
  productionRunId: number;
  productionNumber: string | null;
};

type ProductionRunBranchJoin = {
  id: number;
  name: string | null;
  branch_kind: string | null;
} | null;

type ProductionRunIngredientUnitJoin = {
  unit_id: number;
  to_base_factor: number | string;
  is_base: boolean;
  is_active: boolean;
  units: { name: string | null } | null;
};

type ProductionRunIngredientJoin = {
  id: number;
  name: string | null;
  ingredient_units?: ProductionRunIngredientUnitJoin[] | null;
} | null;

type ProductionRunQueryRow = {
  id: number;
  branch_id: number;
  production_number: string;
  finished_good_id: number;
  planned_quantity: number | string;
  actual_quantity: number | string | null;
  entry_unit_id: number | null;
  source_location_id: number | null;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  started_at: string | null;
  target_branch_id: number | null;
  ingredients_override: Json | null;
  branches: ProductionRunBranchJoin;
  target_branch: ProductionRunBranchJoin;
  ingredients: ProductionRunIngredientJoin;
  units: { id: number; name: string | null } | null;
};

function productionRunOutputUnit(
  run: ProductionRunQueryRow,
): ProductionRunIngredientUnitJoin | null {
  const units = run.ingredients?.ingredient_units ?? [];
  const unit =
    run.entry_unit_id == null
      ? units.find((candidate) => candidate.is_base && candidate.is_active)
      : units.find(
          (candidate) =>
            candidate.unit_id === run.entry_unit_id && candidate.is_active,
        );

  return unit ?? null;
}

function productionRunOutputUnitFactor(
  run: ProductionRunQueryRow,
): number | null {
  const factor = Number(productionRunOutputUnit(run)?.to_base_factor);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

function hasProductionRecipeUnitMappingError(
  message: string | null | undefined,
) {
  if (!message) return false;
  return (
    message.includes("production_recipe_unit_mapping_missing") ||
    message.includes("is not valid for ingredient") ||
    message.includes("entry_unit_not_found")
  );
}

function hasProductionRunUnitMappingReviewError(
  message: string | null | undefined,
) {
  return (
    message?.includes("production_run_unit_mapping_review_required") ?? false
  );
}

function productionIngredientOverrides(
  value: Json | null,
): ProductionIngredientOverride[] | null {
  return Array.isArray(value)
    ? (value as ProductionIngredientOverride[])
    : null;
}

function productionRunCreateResult(
  value: Json | null,
): CreateProductionRunResult | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  const row = value as {
    production_run_id?: unknown;
    production_number?: unknown;
  };
  const id = Number(row.production_run_id);
  if (!Number.isInteger(id) || id <= 0) return null;

  return {
    productionRunId: id,
    productionNumber:
      typeof row.production_number === "string" ? row.production_number : null,
  };
}

export async function fetchProductionRuns(): Promise<
  ActionResult<ProductionRunRow[]>
> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_ORDER_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const access = await requireProductionAccess(supabase, claims);
  if (!access.ok) return { success: false, error: access.error };

  let query = supabase
    .from("production_runs")
    .select(
      `
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
      source_location_id,
      target_branch_id,
      ingredients_override,
      branches!production_runs_branch_id_fkey ( id, name, branch_kind ),
      target_branch:branches!production_runs_target_branch_id_fkey ( id, name, branch_kind ),
      ingredients!inner (
        id,
        name,
        ingredient_units!ingredient_units_ingredient_tenant_fkey (
          unit_id,
          to_base_factor,
          is_base,
          is_active,
          units!ingredient_units_unit_tenant_fkey ( name )
        )
      ),
      units ( id, name )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .in("branches.branch_kind", ["central_kitchen", "branch"])
    .order("created_at", { ascending: false });

  if (
    isProductionSiteScopedRole(claims.user_role) &&
    claims.branch_id != null
  ) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchProductionRuns error:", error);
    return { success: false, error: "Lỗi tải danh sách Lệnh sản xuất" };
  }

  const rows: ProductionRunRow[] = (
    (data || []) as ProductionRunQueryRow[]
  ).map((row) => ({
    id: row.id,
    branch_id: row.branch_id,
    branch_name: row.branches?.name ?? "Unknown",
    target_branch_id: row.target_branch_id ?? row.branch_id,
    target_branch_name:
      row.target_branch?.name ?? row.branches?.name ?? "Unknown",
    production_number: row.production_number,
    finished_good_id: row.finished_good_id,
    finished_good_name: row.ingredients?.name ?? "Unknown",
    planned_quantity: Number(row.planned_quantity),
    actual_quantity:
      row.actual_quantity != null ? Number(row.actual_quantity) : null,
    entry_unit_id: row.entry_unit_id,
    entry_unit_name:
      row.units?.name ??
      row.ingredients?.ingredient_units?.find((u) => u.is_base)?.units?.name ??
      null,
    entry_unit_to_base_factor: productionRunOutputUnitFactor(row),
    source_location_id: row.source_location_id,
    status: row.status,
    notes: row.notes,
    completed_at: row.completed_at,
    created_at: row.created_at,
    started_at: row.started_at,
    ingredients_override: productionIngredientOverrides(
      row.ingredients_override,
    ),
  }));

  return { success: true, data: rows };
}

export async function fetchProductionRunById(
  id: number,
): Promise<ActionResult<ProductionRunRow>> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_ORDER_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const access = await requireProductionAccess(supabase, claims);
  if (!access.ok) return { success: false, error: access.error };

  const { data, error } = await supabase
    .from("production_runs")
    .select(
      `
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
      source_location_id,
      target_branch_id,
      ingredients_override,
      branches!production_runs_branch_id_fkey ( id, name, branch_kind ),
      target_branch:branches!production_runs_target_branch_id_fkey ( id, name, branch_kind ),
      ingredients!inner (
        id,
        name,
        ingredient_units!ingredient_units_ingredient_tenant_fkey (
          unit_id,
          to_base_factor,
          is_base,
          is_active,
          units!ingredient_units_unit_tenant_fkey ( name )
        )
      ),
      units ( id, name )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Không tìm thấy Lệnh sản xuất" };
  }

  const run = data as ProductionRunQueryRow;
  const row: ProductionRunRow = {
    id: run.id,
    branch_id: run.branch_id,
    branch_name: run.branches?.name ?? "Unknown",
    target_branch_id: run.target_branch_id ?? run.branch_id,
    target_branch_name:
      run.target_branch?.name ?? run.branches?.name ?? "Unknown",
    production_number: run.production_number,
    finished_good_id: run.finished_good_id,
    finished_good_name: run.ingredients?.name ?? "Unknown",
    planned_quantity: Number(run.planned_quantity),
    actual_quantity:
      run.actual_quantity != null ? Number(run.actual_quantity) : null,
    entry_unit_id: run.entry_unit_id,
    entry_unit_name:
      run.units?.name ??
      run.ingredients?.ingredient_units?.find((u) => u.is_base)?.units?.name ??
      null,
    entry_unit_to_base_factor: productionRunOutputUnitFactor(run),
    source_location_id: run.source_location_id,
    status: run.status,
    notes: run.notes,
    completed_at: run.completed_at,
    created_at: run.created_at,
    started_at: run.started_at,
    ingredients_override: productionIngredientOverrides(
      run.ingredients_override,
    ),
  };

  return { success: true, data: row };
}

import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";

export const createProductionRun = withAction<
  typeof createProductionRunSchema,
  CreateProductionRunResult
>(
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
      console.error(
        "createProductionRun recipe check error:",
        recipeCheckError,
      );
      return { success: false, error: "Lỗi kiểm tra công thức sản xuất" };
    }

    if (!recipeLineCount) {
      return {
        success: false,
        error: "Thành phẩm này chưa có công thức sản xuất.",
      };
    }

    const { error, data } = await (
      supabase.rpc as unknown as CreateProductionRunWithLocationsRpc
    )("create_production_run_with_locations", {
      p_branch_id: parsed.branchId,
      p_finished_good_id: parsed.finishedGoodId,
      p_planned_quantity: parsed.plannedQuantity,
      p_entry_unit_id: parsed.entryUnitId ?? null,
      p_notes: parsed.notes ?? null,
      p_target_branch_id: parsed.targetBranchId ?? parsed.branchId,
      p_ingredients_override: (parsed.ingredientsOverride ?? null) as Json,
      p_source_location_id: parsed.sourceLocationId ?? null,
      p_target_location_id: parsed.targetLocationId ?? null,
    });

    if (error) {
      console.error("createProductionRun error:", error);
      if (hasProductionRecipeUnitMappingError(error.message)) {
        return { success: false, error: PRODUCTION_RECIPE_UNIT_MAPPING_ERROR };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE)
        return { success: false, error: "Không có quyền thực hiện" };
      if (error.message.includes("production_source_location_missing")) {
        return { success: false, error: "Chưa cấu hình nơi xuất nguyên liệu." };
      }
      if (error.message.includes("production_target_location_missing")) {
        return { success: false, error: "Chưa cấu hình nơi nhập thành phẩm." };
      }
      return { success: false, error: "Lỗi tạo Lệnh sản xuất" };
    }

    const result = productionRunCreateResult(data);
    if (!result) {
      return { success: false, error: "Lỗi tạo Lệnh sản xuất" };
    }

    return {
      success: true,
      data: result,
    };
  },
);

const confirmProductionRunSchema = z.object({
  id: z.coerce.number().int().positive(),
  actualQuantity: z.coerce.number().positive().optional(),
  actualIngredients: z
    .array(
      z.object({
        ingredient_id: z.coerce.number().int().positive(),
        actual_quantity: z.coerce.number().nonnegative(),
      }),
    )
    .optional(),
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
      p_actual_ingredients: (parsed.actualIngredients ?? null) as Json,
    });

    if (error) {
      console.error("confirmProductionRun error:", error);
      const message = error.message || "";

      if (hasProductionRecipeUnitMappingError(message)) {
        return { success: false, error: PRODUCTION_RECIPE_UNIT_MAPPING_ERROR };
      }

      if (hasProductionRunUnitMappingReviewError(message)) {
        return {
          success: false,
          error: PRODUCTION_RUN_UNIT_MAPPING_REVIEW_ERROR,
        };
      }

      if (message.includes("production_run_not_found")) {
        return { success: false, error: "Không tìm thấy lệnh" };
      }
      if (message.includes("production_run_not_draft")) {
        return {
          success: false,
          error:
            "Chỉ có thể xác nhận lệnh đang ở trạng thái nháp hoặc đang xử lý.",
        };
      }
      if (message.includes("insufficient_stock_for_production")) {
        const shortages = parseShortagesDetail(error.details);
        return {
          success: false,
          error: "Kho không đủ nguyên liệu",
          data: shortages,
        };
      }
      if (message.includes("production_recipe_missing")) {
        return { success: false, error: "Thiếu công thức sản xuất" };
      }
      if (message.includes("production_source_location_missing")) {
        return { success: false, error: "Chưa cấu hình nơi xuất nguyên liệu." };
      }
      if (message.includes("production_target_location_missing")) {
        return { success: false, error: "Chưa cấu hình nơi nhập thành phẩm." };
      }
      if (
        error.code === PG_ERR.INSUFFICIENT_PRIVILEGE ||
        message.includes("forbidden") ||
        message.includes("branch_scope_violation")
      ) {
        return { success: false, error: "Không có quyền thực hiện" };
      }
      return { success: false, error: "Lỗi xác nhận Lệnh sản xuất" };
    }

    return {
      success: true,
      data: data as unknown as ProductionShortageRow[] | null,
    };
  },
);

export const recordProductionRun = withAction<
  typeof recordProductionRunSchema,
  ProductionShortageRow[] | null
>(
  {
    schema: recordProductionRunSchema,
    roles: INVENTORY_OPS_ROLES,
  },
  async (parsed, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };

    const { error } = await (supabase.rpc as unknown as RecordProductionRunRpc)(
      "record_production_run",
      {
        p_branch_id: parsed.branchId,
        p_finished_good_id: parsed.finishedGoodId,
        p_planned_quantity: parsed.plannedQuantity,
        p_entry_unit_id: parsed.entryUnitId ?? null,
        p_actual_quantity: parsed.actualQuantity,
        p_notes: parsed.notes ?? null,
        p_target_branch_id: parsed.targetBranchId ?? parsed.branchId,
        p_actual_ingredients: (parsed.ingredientsOverride ?? null) as Json,
        p_source_location_id: parsed.sourceLocationId ?? null,
        p_target_location_id: parsed.targetLocationId ?? null,
      },
    );

    if (error) {
      console.error("recordProductionRun error:", error);
      const message = error.message || "";

      if (hasProductionRecipeUnitMappingError(message)) {
        return { success: false, error: PRODUCTION_RECIPE_UNIT_MAPPING_ERROR };
      }
      if (hasProductionRunUnitMappingReviewError(message)) {
        return {
          success: false,
          error: PRODUCTION_RUN_UNIT_MAPPING_REVIEW_ERROR,
        };
      }
      if (message.includes("insufficient_stock_for_production")) {
        return {
          success: false,
          error: "Kho không đủ nguyên liệu",
          data: parseShortagesDetail(error.details),
        };
      }
      if (message.includes("production_recipe_missing")) {
        return { success: false, error: "Thiếu công thức sản xuất" };
      }
      if (message.includes("production_source_location_missing")) {
        return { success: false, error: "Chưa cấu hình nơi xuất nguyên liệu." };
      }
      if (message.includes("production_target_location_missing")) {
        return { success: false, error: "Chưa cấu hình nơi nhập thành phẩm." };
      }
      if (
        error.code === PG_ERR.INSUFFICIENT_PRIVILEGE ||
        message.includes("forbidden") ||
        message.includes("branch_scope_violation")
      ) {
        return { success: false, error: "Không có quyền thực hiện" };
      }
      return { success: false, error: "Lỗi ghi nhận mẻ sản xuất" };
    }

    return { success: true, data: null };
  },
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
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE)
        return { success: false, error: "Không có quyền thực hiện" };
      return { success: false, error: "Lỗi hủy Lệnh sản xuất" };
    }

    return { success: true, data };
  },
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
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE)
        return { success: false, error: "Không có quyền thực hiện" };
      return { success: false, error: "Lỗi bắt đầu Lệnh sản xuất" };
    }

    return { success: true, data };
  },
);

export interface ProductionRecipeIngredient {
  ingredient_id: number;
  ingredient_name: string;
  unit_name: string;
  entry_unit_id: number | null;
  recipe_quantity: number;
  yield_factor: number;
  default_usage_per_fg: number;
  current_quantity_base: number;
  required_base_per_fg: number;
  max_ingredient_qty: number;
}

type ProductionRecipeContextRow = Omit<
  ProductionRecipeIngredient,
  "default_usage_per_fg"
>;

type ProductionRecipeContextRpc = (
  fn: "get_production_recipe_context_for_location",
  args: {
    p_finished_good_id: number;
    p_branch_id: number;
    p_source_location_id: number | null;
  },
) => Promise<{
  data: ProductionRecipeContextRow[] | null;
  error: { message: string; code?: string } | null;
}>;

type CreateProductionRunWithLocationsRpc = (
  fn: "create_production_run_with_locations",
  args: {
    p_branch_id: number;
    p_finished_good_id: number;
    p_planned_quantity: number;
    p_entry_unit_id: number | null;
    p_notes: string | null;
    p_target_branch_id: number;
    p_ingredients_override: Json | null;
    p_source_location_id: number | null;
    p_target_location_id: number | null;
  },
) => Promise<{
  data: Json | null;
  error: { message: string; code?: string; details?: string | null } | null;
}>;

type RecordProductionRunRpc = (
  fn: "record_production_run",
  args: {
    p_branch_id: number;
    p_finished_good_id: number;
    p_planned_quantity: number;
    p_entry_unit_id: number | null;
    p_actual_quantity: number;
    p_notes: string | null;
    p_target_branch_id: number;
    p_actual_ingredients: Json | null;
    p_source_location_id: number | null;
    p_target_location_id: number | null;
  },
) => Promise<{
  data: Json | null;
  error: { message: string; code?: string; details?: string | null } | null;
}>;

export async function fetchProductionRecipeContext(
  finishedGoodId: number,
  branchId: number,
  sourceLocationId?: number,
): Promise<
  ActionResult<{
    ingredients: ProductionRecipeIngredient[];
    maxProductionQuantity: number | null;
  }>
> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_ORDER_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const access = await requireProductionAccess(supabase, claims);
  if (!access.ok) return { success: false, error: access.error };

  const { data, error } = await (
    supabase.rpc as unknown as ProductionRecipeContextRpc
  )("get_production_recipe_context_for_location", {
    p_finished_good_id: finishedGoodId,
    p_branch_id: branchId,
    p_source_location_id: sourceLocationId ?? null,
  });

  if (error) {
    console.error("fetchProductionRecipeContext error:", error);
    return {
      success: false,
      error: hasProductionRecipeUnitMappingError(error.message)
        ? PRODUCTION_RECIPE_UNIT_MAPPING_ERROR
        : "Lỗi lấy thông tin công thức",
    };
  }

  const ingredients = (data ?? []).map((ingredient) => {
    const yieldFactor = Number(ingredient.yield_factor);
    return {
      ...ingredient,
      default_usage_per_fg:
        Number.isFinite(yieldFactor) && yieldFactor > 0
          ? Number(ingredient.recipe_quantity) / yieldFactor
          : 0,
    };
  });

  let maxProductionQuantity: number | null = null;
  for (const ing of ingredients) {
    if (ing.required_base_per_fg > 0) {
      const possible =
        Math.floor(
          (ing.current_quantity_base / ing.required_base_per_fg) * 1000,
        ) / 1000;
      if (maxProductionQuantity === null || possible < maxProductionQuantity) {
        maxProductionQuantity = possible;
      }
    }
  }

  return { success: true, data: { ingredients, maxProductionQuantity } };
}
