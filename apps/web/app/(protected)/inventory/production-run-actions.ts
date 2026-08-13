"use server";

import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithAnyPermission } from "./_lib/auth";
import {
  isProductionSiteScopedRole,
  PRODUCTION_ROLES,
  requireProductionAccess,
} from "./_lib/production-shared";
import type { ProductionShortageRow } from "./production-types";
import {
  inventoryNonnegativeQuantitySchema,
  inventoryPositiveQuantitySchema,
} from "./_lib/inventory-quantity-schema";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  INVENTORY_ERROR_CODES,
  productionRpcFallback,
  productionRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

const PRODUCTION_ORDER_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
] as const;
const productionCopy = messages.inventory.operatorFlow;

const actualIngredientSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  actualQuantity: inventoryNonnegativeQuantitySchema,
});

const createProductionRunSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  recipeSpecId: z.coerce.number().int().positive(),
  plannedQuantity: inventoryPositiveQuantitySchema,
  sourceLocationId: z.coerce.number().int().positive().optional(),
  targetLocationId: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().max(500).optional(),
});

const completeProductionRunSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive(),
    actualQuantity: inventoryPositiveQuantitySchema,
    actualIngredients: z.array(actualIngredientSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.actualIngredients.forEach((line, index) => {
      if (seen.has(line.ingredientId)) {
        ctx.addIssue({
          code: "custom",
          path: ["actualIngredients", index, "ingredientId"],
          message: "Nguyên liệu thực tế bị trùng.",
        });
      }
      seen.add(line.ingredientId);
    });
  });

const transitionSchema = z.object({
  id: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
});

const cancelSchema = transitionSchema.extend({
  reason: z.string().trim().max(500).optional(),
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

function parseShortagesDetail(details: string | null | undefined) {
  if (!details) return [];
  try {
    const parsed = productionShortageListSchema.safeParse(JSON.parse(details));
    return parsed.success
      ? parsed.data.map((row) => ({
          ...row,
          missing: row.needed - row.on_hand,
        }))
      : [];
  } catch {
    return [];
  }
}

export interface ProductionRunLineRow {
  ingredient_id: number;
  ingredient_name: string;
  planned_quantity: number;
  actual_quantity: number | null;
  entry_unit_id: number;
  entry_unit_name: string;
  entry_unit_to_base_factor: number;
}

export interface ProductionRunRow {
  id: number;
  branch_id: number;
  branch_name: string;
  production_number: string;
  recipe_spec_id: number | null;
  recipe_output_quantity: number | null;
  finished_good_id: number;
  finished_good_name: string;
  planned_quantity: number;
  actual_quantity: number | null;
  entry_unit_id: number | null;
  entry_unit_name: string | null;
  entry_unit_to_base_factor: number | null;
  source_location_id: number | null;
  target_location_id: number | null;
  status: string;
  notes: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  created_at: string;
  started_at: string | null;
  lines: ProductionRunLineRow[];
}

type RunQueryRow = {
  id: number;
  branch_id: number;
  production_number: string;
  recipe_spec_id: number | null;
  recipe_output_quantity: number | string | null;
  finished_good_id: number;
  planned_quantity: number | string;
  actual_quantity: number | string | null;
  entry_unit_id: number | null;
  entry_to_base_factor: number | string | null;
  source_location_id: number | null;
  target_location_id: number | null;
  status: string;
  notes: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  created_at: string;
  started_at: string | null;
  branches: { name: string | null; branch_kind: string | null } | null;
  ingredients: { name: string | null } | null;
  units: { name: string | null } | null;
  production_run_lines?: Array<{
    ingredient_id: number;
    planned_quantity: number | string;
    actual_quantity: number | string | null;
    entry_unit_id: number;
    entry_to_base_factor: number | string;
    ingredients: { name: string | null } | null;
    units: { name: string | null } | null;
  }> | null;
};

const RUN_HEADER_SELECT = `
  id, branch_id, production_number, recipe_spec_id, recipe_output_quantity,
  finished_good_id, planned_quantity, actual_quantity, entry_unit_id,
  entry_to_base_factor, source_location_id, target_location_id, status, notes,
  cancel_reason, completed_at, created_at, started_at,
  branches!production_runs_branch_id_fkey ( name, branch_kind ),
  ingredients!production_runs_finished_good_id_fkey ( name ),
  units!production_runs_entry_unit_id_fkey ( name )
`;

const RUN_LINE_SELECT = `
  production_run_id, ingredient_id, planned_quantity, actual_quantity,
  entry_unit_id, entry_to_base_factor,
  ingredients!production_run_lines_ingredient_id_fkey ( name ),
  units!production_run_lines_entry_unit_id_fkey ( name )
`;

const RUN_SELECT = `${RUN_HEADER_SELECT},
  production_run_lines (
    ingredient_id, planned_quantity, actual_quantity, entry_unit_id,
    entry_to_base_factor,
    ingredients!production_run_lines_ingredient_id_fkey ( name ),
    units!production_run_lines_entry_unit_id_fkey ( name )
  )
`;

function toProductionRun(row: RunQueryRow): ProductionRunRow {
  return {
    id: row.id,
    branch_id: row.branch_id,
    branch_name: row.branches?.name ?? UNKNOWN_LABEL_VI,
    production_number: row.production_number,
    recipe_spec_id: row.recipe_spec_id,
    recipe_output_quantity:
      row.recipe_output_quantity == null ? null : Number(row.recipe_output_quantity),
    finished_good_id: row.finished_good_id,
    finished_good_name: row.ingredients?.name ?? UNKNOWN_LABEL_VI,
    planned_quantity: Number(row.planned_quantity),
    actual_quantity:
      row.actual_quantity == null ? null : Number(row.actual_quantity),
    entry_unit_id: row.entry_unit_id,
    entry_unit_name: row.units?.name ?? null,
    entry_unit_to_base_factor:
      row.entry_to_base_factor == null ? null : Number(row.entry_to_base_factor),
    source_location_id: row.source_location_id,
    target_location_id: row.target_location_id,
    status: row.status,
    notes: row.notes,
    cancel_reason: row.cancel_reason,
    completed_at: row.completed_at,
    created_at: row.created_at,
    started_at: row.started_at,
    lines: (row.production_run_lines ?? [])
      .map((line) => ({
        ingredient_id: line.ingredient_id,
        ingredient_name: line.ingredients?.name ?? UNKNOWN_LABEL_VI,
        planned_quantity: Number(line.planned_quantity),
        actual_quantity:
          line.actual_quantity == null ? null : Number(line.actual_quantity),
        entry_unit_id: line.entry_unit_id,
        entry_unit_name: line.units?.name ?? UNKNOWN_LABEL_VI,
        entry_unit_to_base_factor: Number(line.entry_to_base_factor),
      }))
      .sort((a, b) => a.ingredient_id - b.ingredient_id),
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
    .select(RUN_HEADER_SELECT)
    .eq("tenant_id", claims.tenant_id)
    .eq("branches.branch_kind", "central_kitchen")
    .order("created_at", { ascending: false })
    .limit(200);
  if (isProductionSiteScopedRole(claims.user_role) && claims.branch_id != null) {
    query = query.eq("branch_id", claims.branch_id);
  }
  const { data, error } = await query;
  if (error) {
    console.error("inventory.production.runs_load_failed", error);
    return { success: false, error: productionCopy.productionRunLoadFailed };
  }
  const headers = (data ?? []) as unknown as Array<
    Omit<RunQueryRow, "production_run_lines">
  >;
  const runIds = headers.map((row) => row.id);
  const lineResult =
    runIds.length === 0
      ? { data: [] as Array<NonNullable<RunQueryRow["production_run_lines"]>[number] & { production_run_id: number }>, error: null }
      : await supabase
          .from("production_run_lines")
          .select(RUN_LINE_SELECT)
          .eq("tenant_id", claims.tenant_id)
          .in("production_run_id", runIds);
  if (lineResult.error) {
    console.error("inventory.production.runs_load_failed", lineResult.error);
    return { success: false, error: productionCopy.productionRunLoadFailed };
  }
  const linesByRunId = new Map<number, NonNullable<RunQueryRow["production_run_lines"]>>();
  for (const line of (lineResult.data ?? []) as Array<
    NonNullable<RunQueryRow["production_run_lines"]>[number] & {
      production_run_id: number;
    }
  >) {
    const list = linesByRunId.get(line.production_run_id) ?? [];
    list.push(line);
    linesByRunId.set(line.production_run_id, list);
  }
  return {
    success: true,
    data: headers.map((row) =>
      toProductionRun({
        ...row,
        production_run_lines: linesByRunId.get(row.id) ?? [],
      }),
    ),
  };
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
    .select(RUN_SELECT)
    .eq("tenant_id", claims.tenant_id)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: "Không tìm thấy Lệnh sản xuất." };
  }
  const run = toProductionRun(data as unknown as RunQueryRow);
  if (
    isProductionSiteScopedRole(claims.user_role) &&
    claims.branch_id !== run.branch_id
  ) {
    return { success: false, error: "Không có quyền" };
  }
  return { success: true, data: run };
}

type ProductionRpc = (
  name: string,
  args: Record<string, Json | number | string | null>,
) => Promise<{
  data: Json | null;
  error: { code?: string; message: string; details?: string | null } | null;
}>;

type CreateProductionRunResult = {
  productionRunId: number;
  productionNumber: string | null;
};

function createResult(value: Json | null): CreateProductionRunResult | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const productionRunId = Number(row["production_run_id"]);
  if (!Number.isInteger(productionRunId) || productionRunId <= 0) return null;
  return {
    productionRunId,
    productionNumber:
      typeof row["production_number"] === "string"
        ? row["production_number"]
        : null,
  };
}

function mapMutationError<T>(
  error: { code?: string; message: string; details?: string | null },
): ActionResult<T> {
  // Keep DETAIL JSON on production shortage; clients read `data` + `meta`.
  if (error.message.includes("insufficient_stock_for_production")) {
    const shortages = parseShortagesDetail(error.details);
    return {
      success: false,
      error: "Kho không đủ nguyên liệu.",
      errorCode: INVENTORY_ERROR_CODES.PRODUCTION_SHORTAGE,
      data: shortages as T,
      meta: { shortages },
    };
  }
  return mapInventoryRpcFailure(
    error,
    productionRpcMappings,
    productionRpcFallback,
  );
}

export const createProductionRun = withAction<
  typeof createProductionRunSchema,
  CreateProductionRunResult
>(
  { schema: createProductionRunSchema, roles: INVENTORY_OPS_ROLES },
  async (input, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };
    const { data, error } = await (supabase.rpc as unknown as ProductionRpc)(
      "create_production_run",
      {
        p_branch_id: input.branchId,
        p_recipe_spec_id: input.recipeSpecId,
        p_planned_quantity: input.plannedQuantity,
        p_source_location_id: input.sourceLocationId ?? null,
        p_target_location_id: input.targetLocationId ?? null,
        p_notes: input.notes ?? null,
      },
    );
    if (error) return mapMutationError(error);
    const result = createResult(data);
    return result
      ? { success: true, data: result }
      : { success: false, error: "Không thể tạo Lệnh sản xuất." };
  },
);

export const startProductionRun = withAction<typeof transitionSchema, Json>(
  { schema: transitionSchema, roles: INVENTORY_OPS_ROLES },
  async (input, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };
    const { data, error } = await (supabase.rpc as unknown as ProductionRpc)(
      "start_production_run",
      { p_run_id: input.id, p_branch_id: input.branchId },
    );
    return error ? mapMutationError(error) : { success: true, data };
  },
);

export const completeProductionRun = withAction<
  typeof completeProductionRunSchema,
  Json | ProductionShortageRow[]
>(
  { schema: completeProductionRunSchema, roles: INVENTORY_OPS_ROLES },
  async (input, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };
    const { data, error } = await (supabase.rpc as unknown as ProductionRpc)(
      "complete_production_run",
      {
        p_run_id: input.id,
        p_branch_id: input.branchId,
        p_actual_quantity: input.actualQuantity,
        p_actual_ingredients: input.actualIngredients as Json,
      },
    );
    return error ? mapMutationError(error) : { success: true, data };
  },
);

export const cancelProductionRun = withAction<typeof cancelSchema, Json>(
  { schema: cancelSchema, roles: INVENTORY_OPS_ROLES },
  async (input, { supabase, claims }) => {
    const access = await requireProductionAccess(supabase, claims);
    if (!access.ok) return { success: false, error: access.error };
    const { data, error } = await (supabase.rpc as unknown as ProductionRpc)(
      "cancel_production_run",
      {
        p_run_id: input.id,
        p_branch_id: input.branchId,
        p_reason: input.reason ?? null,
      },
    );
    return error ? mapMutationError(error) : { success: true, data };
  },
);

export interface ProductionRecipeIngredient {
  ingredient_id: number;
  ingredient_name: string;
  unit_name: string;
  entry_unit_id: number;
  recipe_quantity: number;
  planned_quantity: number;
  current_quantity_base: number;
  max_ingredient_qty: number;
}

export async function fetchProductionRecipeContext(
  recipeSpecId: number,
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

  const { data, error } = await supabase
    .from("production_recipes")
    .select(
      `ingredient_id, quantity, entry_unit_id, entry_to_base_factor,
       ingredient:ingredients!production_recipes_ingredient_id_fkey(name),
       unit:units!production_recipes_entry_unit_id_fkey(name),
       spec:production_recipe_specs!production_recipes_recipe_spec_fkey(output_quantity, status)`,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("recipe_spec_id" as never, recipeSpecId)
    .order("ingredient_id");
  if (error || !data?.length) {
    return { success: false, error: productionCopy.productionRecipeLoadFailed };
  }

  const locationId = sourceLocationId ?? null;
  const ingredientIds = (data as unknown as Array<{ ingredient_id: number }>).map(
    (row) => row.ingredient_id,
  );
  let stockQuery = supabase
    .from("stock_levels")
    .select("ingredient_id, current_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", branchId)
    .in("ingredient_id", ingredientIds);
  if (locationId != null) stockQuery = stockQuery.eq("location_id", locationId);
  const { data: stockData, error: stockError } = await stockQuery;
  if (stockError) {
    return { success: false, error: productionCopy.productionStockLoadFailed };
  }
  const stockByIngredient = new Map(
    (stockData ?? []).map((row) => [row.ingredient_id, Number(row.current_quantity)]),
  );

  type RecipeRow = {
    ingredient_id: number;
    quantity: number | string;
    entry_unit_id: number;
    entry_to_base_factor: number | string;
    ingredient: { name: string | null } | null;
    unit: { name: string | null } | null;
    spec: { output_quantity: number | string; status: string } | null;
  };
  const rows = data as unknown as RecipeRow[];
  if (rows[0]?.spec?.status !== "active") {
    return {
      success: false,
      error: "Công thức cần được duyệt trước khi tạo lệnh.",
      errorCode: "PRODUCTION_RECIPE_NOT_ACTIVE",
    };
  }
  const outputQuantity = Number(rows[0]?.spec?.output_quantity ?? 0);
  const ingredients = rows.map((row) => {
    const factor = Number(row.entry_to_base_factor);
    const quantity = Number(row.quantity);
    const stockBase = stockByIngredient.get(row.ingredient_id) ?? 0;
    return {
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredient?.name ?? UNKNOWN_LABEL_VI,
      unit_name: row.unit?.name ?? UNKNOWN_LABEL_VI,
      entry_unit_id: row.entry_unit_id,
      recipe_quantity: quantity,
      planned_quantity: quantity,
      current_quantity_base: stockBase,
      max_ingredient_qty: factor > 0 ? stockBase / factor : 0,
    };
  });
  let maxProductionQuantity: number | null = null;
  for (const row of rows) {
    const requiredBasePerOutput =
      (Number(row.quantity) * Number(row.entry_to_base_factor)) / outputQuantity;
    if (requiredBasePerOutput <= 0) continue;
    const possible =
      (stockByIngredient.get(row.ingredient_id) ?? 0) / requiredBasePerOutput;
    maxProductionQuantity =
      maxProductionQuantity == null
        ? possible
        : Math.min(maxProductionQuantity, possible);
  }
  return { success: true, data: { ingredients, maxProductionQuantity } };
}
