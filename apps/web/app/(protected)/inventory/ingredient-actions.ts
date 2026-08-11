"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { parseVietnameseNumericImport } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { VALIDATION_VI } from "@comtammatu/shared/messages";
import { getVNDateString } from "@comtammatu/shared/time";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
  PROCUREMENT_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { getAuthContext, getAuthContextWithAnyPermission } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import {
  STORAGE_TYPE_BY_LABEL,
  ITEM_KIND_BY_LABEL,
  STORAGE_LABELS,
  ITEM_KIND_LABELS,
  PG_ERR,
} from "./_lib/constants";
import type {
  CategoryOption,
  IngredientRow,
  IngredientUnitRow,
  UnitOption,
} from "@lib/inventory/types";
import { fetchUnits } from "./settings/units/units-actions";
import { fetchCategories } from "./settings/categories/categories-actions";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { inventoryNonnegativeQuantitySchema } from "./_lib/inventory-quantity-schema";
import {
  isValidAnchorFactor,
  isValidEffectiveFactor,
} from "./ingredients/ingredient-unit-form-model";

const INGREDIENTS_LIST_PATH = "/inventory/ingredients";

type IngredientUnitEmbed = {
  id: number;
  unit_id: number;
  to_base_factor: number | string | null;
  is_base: boolean;
  anchor_unit_id: number | null;
  anchor_factor: number | string | null;
  is_active: boolean;
  sort_order: number;
  units?: { code?: string | null; name?: string | null } | null;
};

function mapIngredientUnitRows(
  ingredientUnits: IngredientUnitEmbed[] | null | undefined,
): IngredientUnitRow[] {
  return (ingredientUnits ?? [])
    .map((unit) => ({
      id: unit.id,
      unit_id: unit.unit_id,
      unit_code: unit.units?.code ?? "",
      unit_name: unit.units?.name ?? unit.units?.code ?? "",
      to_base_factor: Number(unit.to_base_factor ?? 1),
      is_base: unit.is_base,
      anchor_unit_id: unit.anchor_unit_id ?? null,
      anchor_factor:
        unit.anchor_factor == null ? null : Number(unit.anchor_factor),
      is_active: unit.is_active,
      sort_order: unit.sort_order,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/* ─── Ingredient catalog (CRUD via save_ingredient_catalog RPC) ─── */

const unitNumericInputSchema = z.union([z.number(), z.string().trim().min(1)]);
const effectiveUnitFactorSchema = unitNumericInputSchema
  .refine(
    isValidEffectiveFactor,
    "Hệ số về đơn vị chuẩn vượt miền 6 số nguyên và 12 số thập phân",
  )
  .transform(Number);
const anchorUnitFactorSchema = unitNumericInputSchema
  .refine(
    isValidAnchorFactor,
    "Hệ số quy đổi có tối đa 9 số nguyên và 9 số thập phân",
  )
  .transform(Number);

const unitRowSchema = z.object({
  unit_id: z.coerce.number().int().positive({ error: "Đơn vị không hợp lệ" }),
  to_base_factor: effectiveUnitFactorSchema,
  is_base: z.boolean(),
  anchor_unit_id: z.coerce.number().int().positive().nullable().optional(),
  anchor_factor: anchorUnitFactorSchema.nullable().optional(),
});

const ingredientBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: VALIDATION_VI.required("Tên nguyên liệu") }),
  sku: z.string().trim().optional(),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]).default("raw_material"),
  min_stock_level: inventoryNonnegativeQuantitySchema.default(0),
  max_stock_level: inventoryNonnegativeQuantitySchema.optional(),
  reorder_point: inventoryNonnegativeQuantitySchema.optional(),
  storage_type: z
    .enum(["ambient", "refrigerated", "frozen"])
    .default("ambient"),
  default_fulfill_site_kind: z
    .enum(["central_supply", "central_kitchen"])
    .nullable()
    .optional(),
  units: z
    .array(unitRowSchema)
    .min(1, { error: "Cần ít nhất 1 đơn vị" })
    .max(20, { error: "Mỗi nguyên liệu có tối đa 20 đơn vị" }),
});

function refineUnits(
  units: z.infer<typeof unitRowSchema>[],
  ctx: z.RefinementCtx,
) {
  const baseRows = units.filter((u) => u.is_base);
  if (baseRows.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "Phải có đúng 1 đơn vị chuẩn",
    });
  }
  const baseRow = baseRows[0];
  if (baseRow && baseRow.to_base_factor !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "Đơn vị chuẩn phải có hệ số = 1",
    });
  }
  const unitIds = units.map((u) => u.unit_id);
  if (new Set(unitIds).size !== unitIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "Đơn vị không được trùng nhau",
    });
  }
}

const ingredientCreateSchema = ingredientBaseSchema.superRefine((data, ctx) => {
  refineUnits(data.units, ctx);
});

const ingredientUpdateSchema = ingredientBaseSchema.superRefine((data, ctx) => {
  refineUnits(data.units, ctx);
});

type IngredientInput = z.infer<typeof ingredientBaseSchema>;

function mapCatalogRpcError(
  code: string | undefined,
  message: string | undefined,
): string {
  if (message?.includes("standard_unit_dimension_mismatch")) {
    return "Các đơn vị chuẩn phải cùng loại đo lường (khối lượng hoặc thể tích).";
  }
  if (
    message?.includes("ingredient_unit_in_use_by_recipe") ||
    message?.includes("ingredient_unit_in_use_by_production_recipe") ||
    message?.includes("production_recipes_ingredient_entry_unit_fkey")
  ) {
    return "Đơn vị đang dùng trong công thức sản xuất hoặc định mức món; không thể thay đổi.";
  }
  if (
    message?.includes("unit not found") ||
    message?.includes("unit_not_found")
  ) {
    return "Đơn vị không hợp lệ";
  }
  if (
    message?.includes("category not found") ||
    message?.includes("category_not_found")
  ) {
    return "Nhóm nguyên liệu không hợp lệ";
  }

  switch (code) {
    case PG_ERR.INSUFFICIENT_PRIVILEGE:
      return "Không có quyền";
    case PG_ERR.CHECK_VIOLATION:
      return "Dữ liệu đơn vị không hợp lệ";
    case PG_ERR.FK_VIOLATION:
      return "Đơn vị hoặc nhóm nguyên liệu không hợp lệ";
    case PG_ERR.UNIQUE_VIOLATION:
      return "Tên/đơn vị bị trùng";
    default:
      return "Không thể lưu nguyên liệu.";
  }
}

function buildRpcUnits(units: IngredientInput["units"]) {
  return units.map((u, index) => ({
    unit_id: u.unit_id,
    to_base_factor: u.is_base ? 1 : u.to_base_factor,
    is_base: u.is_base,
    anchor_unit_id: u.is_base ? null : (u.anchor_unit_id ?? null),
    anchor_factor: u.is_base ? null : (u.anchor_factor ?? null),
    sort_order: index,
  }));
}

type SaveCatalogArgs = {
  p_ingredient_id: number | null;
  p_name: string;
  p_sku: string | null;
  p_category_id: number | null;
  p_item_kind: string;
  p_storage_type: string;
  p_min_stock_level: number;
  p_max_stock_level: number | null;
  p_reorder_point: number | null;
  p_shelf_life_days: number | null;
  p_units: ReturnType<typeof buildRpcUnits>;
  p_default_fulfill_site_kind: "central_supply" | "central_kitchen" | null;
  p_receipt_unit_id: number;
  p_issue_unit_id: number;
  p_production_unit_id: number | null;
};

// The RPC accepts NULL for the nullable params (p_ingredient_id, p_category_id,
// thresholds, …) but the generated Args type marks them non-nullable. Cast the
// nullable scalars through `never` to satisfy the call signature.
function rpcCatalogArgs(
  ingredientId: number | null,
  data: IngredientInput,
  shelfLifeDays: number | null = null,
  defaultFulfillSiteKind: "central_supply" | "central_kitchen" | null = null,
): SaveCatalogArgs {
  const baseUnitId = data.units.find((unit) => unit.is_base)?.unit_id;
  if (baseUnitId == null) throw new Error("base_unit_missing");
  return {
    p_ingredient_id: ingredientId,
    p_name: data.name,
    p_sku: data.sku?.trim() || null,
    p_category_id: data.category_id ?? null,
    p_item_kind: data.item_kind,
    p_storage_type: data.storage_type,
    p_min_stock_level: data.min_stock_level,
    p_max_stock_level: data.max_stock_level ?? null,
    p_reorder_point: data.reorder_point ?? null,
    p_shelf_life_days: shelfLifeDays,
    p_units: buildRpcUnits(data.units),
    p_default_fulfill_site_kind: defaultFulfillSiteKind,
    // Compatibility mirrors until the legacy role columns are removed.
    p_receipt_unit_id: baseUnitId,
    p_issue_unit_id: baseUnitId,
    p_production_unit_id: null,
  };
}

function saveIngredientCatalog(
  supabase: SupabaseClient<Database>,
  args: SaveCatalogArgs,
) {
  return (
    supabase.rpc as unknown as (
      fn: "save_ingredient_catalog",
      rpcArgs: SaveCatalogArgs,
    ) => ReturnType<SupabaseClient<Database>["rpc"]>
  )("save_ingredient_catalog", args);
}

/* ─── fetchIngredients (full catalog — SM manages it; ops view by workflow) ─── */

// Read gate: procurement roles read for valuation/PO context, inventory ops
// roles (incl. branch_manager) read for branch stock workflows (on-hand,
// stock-issues, transfers). Write stays on INVENTORY_CATALOG_ROLES (owner).
// getAuthContext(PROCUREMENT_ROLES)
const INGREDIENT_READ_ROLES: readonly StaffRole[] = Array.from(
  new Set([...PROCUREMENT_ROLES, ...INVENTORY_OPS_ROLES]),
);

const getIngredientsCached = cache(
  async (
    supabase: SupabaseClient,
    tenantId: number,
    limit: number,
    updatedSince: string | undefined,
    includeMonetary: boolean,
    includeUnits: boolean,
  ) => {
    const withUnitsMonetary =
      "*, ingredient_categories!ingredients_category_tenant_fkey(name), ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, anchor_unit_id, anchor_factor, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))";
    const withUnitsLean =
      "id, tenant_id, name, sku, category, category_id, item_kind, min_stock_level, max_stock_level, reorder_point, storage_type, shelf_life_days, is_active, updated_at, default_fulfill_site_kind, ingredient_categories!ingredients_category_tenant_fkey(name), ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, anchor_unit_id, anchor_factor, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))";
    const withoutUnitsMonetary =
      "*, ingredient_categories!ingredients_category_tenant_fkey(name)";
    const withoutUnitsLean =
      "id, tenant_id, name, sku, category, category_id, item_kind, min_stock_level, max_stock_level, reorder_point, storage_type, shelf_life_days, is_active, updated_at, default_fulfill_site_kind, ingredient_categories!ingredients_category_tenant_fkey(name)";

    const select = includeUnits
      ? includeMonetary
        ? withUnitsMonetary
        : withUnitsLean
      : includeMonetary
        ? withoutUnitsMonetary
        : withoutUnitsLean;

    let query = supabase
      .from("ingredients")
      .select(select)
      .eq("tenant_id", tenantId);

    if (updatedSince) {
      query = query.gt("updated_at", updatedSince);
    }

    return query.order("name").limit(limit);
  },
);

export type FetchIngredientsOptions = {
  includeUnits?: boolean;
};

export async function fetchIngredients(
  limit = 2000,
  updatedSince?: string,
  options?: FetchIngredientsOptions,
): Promise<ActionResult<IngredientRow[]>> {
  const ctx = await getAuthContext(INGREDIENT_READ_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const includeUnits = options?.includeUnits !== false;
  const { supabase, claims } = ctx;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const readClient = monetary.purchasePrice
    ? (monetary.client ?? supabase)
    : supabase;

  const [ingredientsResult, supplierLinksResult, baseUnitsResult] =
    await Promise.all([
      getIngredientsCached(
        readClient,
        claims.tenant_id,
        safeLimit,
        updatedSince,
        monetary.purchasePrice,
        includeUnits,
      ),
      // Match YCM gate: active supplier_items on an active supplier.
      supabase
        .from("supplier_items")
        .select("ingredient_id, suppliers!inner(id)")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .eq("suppliers.is_active", true),
      includeUnits
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("ingredient_units")
            .select(
              "ingredient_id, units!ingredient_units_unit_tenant_fkey(code, name)",
            )
            .eq("tenant_id", claims.tenant_id)
            .eq("is_base", true)
            .eq("is_active", true),
    ]);

  const { data, error } = ingredientsResult;

  if (error) {
    return {
      success: false,
      error: messages.inventory.ingredients.list.loadFailed,
    };
  }

  if (supplierLinksResult.error || baseUnitsResult.error) {
    return {
      success: false,
      error: messages.inventory.ingredients.list.loadFailed,
    };
  }

  const linkedIngredientIds = new Set<number>();
  for (const link of supplierLinksResult.data ?? []) {
    linkedIngredientIds.add(Number(link.ingredient_id));
  }

  const baseUnitByIngredientId = new Map<number, string>();
  if (!includeUnits) {
    for (const row of baseUnitsResult.data ?? []) {
      const ingredientId = Number(row.ingredient_id);
      const units = row.units as
        | { code?: string | null; name?: string | null }
        | null
        | undefined;
      const label = units?.name?.trim() || units?.code?.trim() || "";
      if (label) baseUnitByIngredientId.set(ingredientId, label);
    }
  }

  const rows: IngredientRow[] = (data ?? []).map((raw) => {
    const row = raw as unknown as {
      id: number;
      name?: string | null;
      sku?: string | null;
      category?: string | null;
      category_id?: number | null;
      item_kind?: string | null;
      min_stock_level?: number | null;
      max_stock_level?: number | null;
      reorder_point?: number | null;
      storage_type?: string | null;
      default_fulfill_site_kind?:
        | "central_supply"
        | "central_kitchen"
        | null;
      is_active?: boolean | null;
      updated_at?: string | null;
      unit_cost?: number | null;
      ingredient_categories?: { name?: string | null } | null;
      ingredient_units?: IngredientUnitEmbed[] | null;
    };
    const {
      ingredient_categories,
      ingredient_units,
      unit_cost,
      ...rest
    } = row;
    const unitCost =
      monetary.purchasePrice && unit_cost != null ? Number(unit_cost) : null;
    const units = includeUnits
      ? mapIngredientUnitRows(ingredient_units)
      : undefined;
    const baseUnit = units?.find((unit) => unit.is_base);
    const ingredientId = Number(rest.id);

    return {
      id: ingredientId,
      name: String(rest.name ?? ""),
      sku: rest.sku ?? null,
      category: rest.category ?? null,
      category_id: rest.category_id ?? null,
      item_kind: String(rest.item_kind ?? "raw_material"),
      min_stock_level: rest.min_stock_level ?? null,
      max_stock_level: rest.max_stock_level ?? null,
      reorder_point: rest.reorder_point ?? null,
      storage_type: rest.storage_type ?? null,
      default_fulfill_site_kind: rest.default_fulfill_site_kind ?? null,
      is_active: Boolean(rest.is_active),
      updated_at: rest.updated_at ?? null,
      monetary: monetary.purchasePrice ? { unitCost } : null,
      category_name: ingredient_categories?.name ?? null,
      ...(units ? { units } : {}),
      unit: includeUnits
        ? (baseUnit?.unit_name ?? "")
        : (baseUnitByIngredientId.get(ingredientId) ?? ""),
      has_active_supplier_link: linkedIngredientIds.has(ingredientId),
    };
  });

  return { success: true, data: rows };
}

export async function fetchIngredientDetail(
  id: number,
): Promise<ActionResult<IngredientRow>> {
  const parsedId = z.coerce.number().int().positive().safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: "Mã nguyên liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(INGREDIENT_READ_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const readClient = monetary.purchasePrice
    ? (monetary.client ?? supabase)
    : supabase;

  const [ingredientResult, supplierLinkResult] = await Promise.all([
    monetary.purchasePrice
      ? readClient
          .from("ingredients")
          .select(
            "*, ingredient_categories!ingredients_category_tenant_fkey(name), ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, anchor_unit_id, anchor_factor, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("id", parsedId.data)
          .maybeSingle()
      : readClient
          .from("ingredients")
          .select(
            "id, tenant_id, name, sku, category, category_id, item_kind, min_stock_level, max_stock_level, reorder_point, storage_type, shelf_life_days, is_active, updated_at, default_fulfill_site_kind, ingredient_categories!ingredients_category_tenant_fkey(name), ingredient_units!ingredient_units_ingredient_tenant_fkey(id, unit_id, to_base_factor, is_base, anchor_unit_id, anchor_factor, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("id", parsedId.data)
          .maybeSingle(),
    supabase
      .from("supplier_items")
      .select("ingredient_id, suppliers!inner(id)")
      .eq("tenant_id", claims.tenant_id)
      .eq("ingredient_id", parsedId.data)
      .eq("is_active", true)
      .eq("suppliers.is_active", true)
      .limit(1),
  ]);

  if (ingredientResult.error || supplierLinkResult.error) {
    return {
      success: false,
      error: messages.inventory.ingredients.list.loadFailed,
    };
  }
  if (!ingredientResult.data) {
    return { success: false, error: "Nguyên liệu không tồn tại." };
  }

  const row = ingredientResult.data as unknown as {
    id: number;
    name?: string | null;
    sku?: string | null;
    category?: string | null;
    category_id?: number | null;
    item_kind?: string | null;
    min_stock_level?: number | null;
    max_stock_level?: number | null;
    reorder_point?: number | null;
    storage_type?: string | null;
    default_fulfill_site_kind?: "central_supply" | "central_kitchen" | null;
    is_active?: boolean | null;
    updated_at?: string | null;
    unit_cost?: number | null;
    ingredient_categories?: { name?: string | null } | null;
    ingredient_units?: IngredientUnitEmbed[] | null;
  };
  const {
    ingredient_categories,
    ingredient_units,
    unit_cost,
    ...rest
  } = row;
  const unitCost =
    monetary.purchasePrice && unit_cost != null ? Number(unit_cost) : null;
  const units = mapIngredientUnitRows(ingredient_units);
  const baseUnit = units.find((unit) => unit.is_base);

  return {
    success: true,
    data: {
      id: parsedId.data,
      name: String(rest.name ?? ""),
      sku: rest.sku ?? null,
      category: rest.category ?? null,
      category_id: rest.category_id ?? null,
      item_kind: String(rest.item_kind ?? "raw_material"),
      min_stock_level: rest.min_stock_level ?? null,
      max_stock_level: rest.max_stock_level ?? null,
      reorder_point: rest.reorder_point ?? null,
      storage_type: rest.storage_type ?? null,
      default_fulfill_site_kind: rest.default_fulfill_site_kind ?? null,
      is_active: Boolean(rest.is_active),
      updated_at: rest.updated_at ?? null,
      monetary: monetary.purchasePrice ? { unitCost } : null,
      category_name: ingredient_categories?.name ?? null,
      units,
      unit: baseUnit?.unit_name ?? "",
      has_active_supplier_link: (supplierLinkResult.data?.length ?? 0) > 0,
    },
  };
}

/* ─── Option fetchers for the dialog dropdowns ─── */

export async function fetchUnitOptions(): Promise<ActionResult<UnitOption[]>> {
  const result = await fetchUnits();
  if (!result.success) return result;
  const options = (result.data ?? [])
    .filter((u) => u.is_active)
    .map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      dimension: u.dimension,
      is_standard: u.is_standard,
      standard_factor: u.standard_factor,
    }));
  return { success: true, data: options };
}

export async function fetchCategoryOptions(): Promise<
  ActionResult<CategoryOption[]>
> {
  const result = await fetchCategories();
  if (!result.success) return result;
  const options = (result.data ?? [])
    .filter((c) => c.is_active)
    .map((c) => ({ id: c.id, name: c.name, tone_class: c.tone_class }));
  return { success: true, data: options };
}

/* ─── createIngredient ─── */

export const createIngredient = withAction<
  typeof ingredientCreateSchema,
  { id: number }
>(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: ingredientCreateSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase }) => {
    const {
      default_fulfill_site_kind: defaultFulfillSiteKind,
      ...catalogData
    } = data;
    const { data: id, error } = await saveIngredientCatalog(
      supabase,
      rpcCatalogArgs(null, catalogData, null, defaultFulfillSiteKind ?? null),
    );

    if (error) {
      return {
        success: false,
        error: mapCatalogRpcError(error.code, error.message),
      };
    }

    const ingredientId = Number(id);
    revalidatePath(INGREDIENTS_LIST_PATH);
    return { success: true, data: { id: ingredientId } };
  },
);

/* ─── quickCreateIngredient (catalog unit from production BOM) ─── */

const quickCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: VALIDATION_VI.required("Tên") }),
  unit: z
    .string()
    .trim()
    .min(1, { error: VALIDATION_VI.required("Đơn vị") }),
  category: z.string().trim().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]),
  storage_type: z.enum(["ambient", "refrigerated", "frozen"]),
});

export const quickCreateIngredient = withAction<
  typeof quickCreateSchema,
  { id: number }
>(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: quickCreateSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const unitCode = data.unit.trim();

    const { data: existingUnit } = await supabase
      .from("units")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("code", unitCode)
      .maybeSingle();

    if (!existingUnit) {
      return { success: false, error: "Đơn vị không có trong danh mục." };
    }
    const unitId = existingUnit.id;

    let categoryId: number | null = null;
    const categoryName = data.category?.trim();
    if (categoryName) {
      const { data: existingCat } = await supabase
        .from("ingredient_categories")
        .select("id")
        .eq("tenant_id", claims.tenant_id)
        .eq("name", categoryName)
        .maybeSingle();
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const { data: insertedCat } = await supabase
          .from("ingredient_categories")
          .insert({ tenant_id: claims.tenant_id, name: categoryName })
          .select("id")
          .single();
        categoryId = insertedCat?.id ?? null;
      }
    }

    const { data: id, error } = await saveIngredientCatalog(
      supabase,
      rpcCatalogArgs(null, {
        name: data.name,
        category_id: categoryId,
        item_kind: data.item_kind,
        storage_type: data.storage_type,
        min_stock_level: 0,
        units: [
          {
            unit_id: unitId,
            to_base_factor: 1,
            is_base: true,
          },
        ],
      }),
    );

    if (error) {
      return {
        success: false,
        error: mapCatalogRpcError(error.code, error.message),
      };
    }

    return { success: true, data: { id: Number(id) } };
  },
);

/* ─── updateIngredient ─── */

export async function updateIngredient(
  id: number,
  input: Partial<IngredientInput>,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: "Mã nguyên liệu không hợp lệ" };
  }

  const parsedInput = ingredientUpdateSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data: existing, error: existingError } = await supabase
    .from("ingredients")
    .select("shelf_life_days, default_fulfill_site_kind")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (existingError) {
    return {
      success: false,
      error: messages.inventory.ingredients.list.loadFailed,
    };
  }
  if (!existing) {
    return { success: false, error: "Nguyên liệu không tồn tại." };
  }

  const { default_fulfill_site_kind: defaultFulfillSiteKind, ...catalogData } =
    parsedInput.data;

  const { error } = await saveIngredientCatalog(
    supabase,
    rpcCatalogArgs(
      parsedId.data,
      catalogData,
      existing.shelf_life_days,
      defaultFulfillSiteKind === undefined
        ? (existing.default_fulfill_site_kind as
            "central_supply" | "central_kitchen" | null)
        : defaultFulfillSiteKind,
    ),
  );

  if (error) {
    return {
      success: false,
      error: mapCatalogRpcError(error.code, error.message),
    };
  }

  revalidatePath(INGREDIENTS_LIST_PATH);
  return { success: true };
}

/* ─── toggleIngredientActive ─── */

const toggleIngredientIdSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive({ error: "Mã nguyên liệu không hợp lệ" }),
});

export const toggleIngredientActive = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: toggleIngredientIdSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("toggle_ingredient_active", {
      p_id: data.id,
    });
    if (error) {
      if (error.message?.includes("not_found")) {
        return { success: false, error: "Nguyên liệu không tồn tại." };
      }
      return { success: false, error: "Không thể đổi trạng thái nguyên liệu." };
    }
    revalidatePath(INGREDIENTS_LIST_PATH);
    return { success: true };
  },
);

/* ─── Export ─── */

interface ExportIngredientRow {
  name: string;
  sku: string | null;
  category: string | null;
  item_kind: string;
  unit_cost?: number | null;
  min_stock_level: number;
  storage_type: string;
  is_active: boolean;
  units: {
    unit_code: string;
    to_base_factor: number;
    is_base: boolean;
  }[];
}

function buildIngredientSheets(
  rows: ExportIngredientRow[],
  includeUnitCost = true,
): SheetDef[] {
  return [
    {
      name: "Nguyên liệu",
      columns: [
        { header: "Tên nguyên liệu", key: "name", width: 32 },
        { header: "SKU", key: "sku", width: 14 },
        { header: "Danh mục", key: "category", width: 18 },
        { header: "Loại hàng", key: "item_kind_label", width: 16 },
        ...(includeUnitCost
          ? [{ header: "Giá nhập (VND)", key: "unit_cost", width: 16 }]
          : []),
        { header: "Tồn tối thiểu", key: "min_stock_level", width: 18 },
        { header: "Bảo quản", key: "storage_label", width: 14 },
        { header: "Hoạt động", key: "is_active", width: 12 },
      ],
      rows: rows.map((r) => ({
        name: r.name,
        sku: r.sku ?? "",
        category: r.category ?? "",
        item_kind_label: ITEM_KIND_LABELS[r.item_kind] ?? UNKNOWN_LABEL_VI,
        ...(includeUnitCost ? { unit_cost: r.unit_cost ?? "" } : {}),
        min_stock_level: r.min_stock_level,
        storage_label: STORAGE_LABELS[r.storage_type] ?? UNKNOWN_LABEL_VI,
        is_active: r.is_active ? "Có" : "Không",
      })),
    },
    {
      name: "Đơn vị",
      columns: [
        { header: "Tên nguyên liệu", key: "ingredient_name", width: 32 },
        { header: "Mã đơn vị", key: "unit_code", width: 14 },
        { header: "Quy đổi về đơn vị chuẩn", key: "to_base_factor", width: 20 },
        { header: "Đơn vị chuẩn", key: "is_base", width: 18 },
      ],
      rows: rows.flatMap((r) =>
        r.units.map((u) => ({
          ingredient_name: r.name,
          unit_code: u.unit_code,
          to_base_factor: u.to_base_factor,
          is_base: u.is_base ? "Có" : "Không",
        })),
      ),
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
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetary.purchasePrice || !monetary.client) {
    return { success: false, error: "Không có quyền" };
  }

  const { data, error } = await monetary.client
    .from("ingredients")
    .select(
      "name, sku, category, item_kind, unit_cost, min_stock_level, storage_type, is_active, ingredient_units!ingredient_units_ingredient_tenant_fkey(to_base_factor, is_base, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("name");

  if (error) {
    return {
      success: false,
      error: messages.inventory.ingredients.list.exportLoadFailed,
    };
  }

  const rows: ExportIngredientRow[] = (data ?? []).map((r) => ({
    name: r.name,
    sku: r.sku,
    category: r.category,
    item_kind: r.item_kind ?? "raw_material",
    unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
    min_stock_level: Number(r.min_stock_level ?? 0),
    storage_type: r.storage_type ?? "ambient",
    is_active: r.is_active ?? true,
    units: (r.ingredient_units ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((u) => ({
        unit_code: u.units?.code ?? "",
        to_base_factor: Number(u.to_base_factor ?? 1),
        is_base: u.is_base,
      })),
  }));

  const sheets = buildIngredientSheets(rows);
  const stamp = getVNDateString();

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

/* ─── Import ─── */

const importIngredientRowSchema = z.object({
  name: z.string().trim().min(1, { error: "Thiếu tên" }),
  sku: z.string().trim().optional(),
  unit: z.string().trim().min(1, { error: "Thiếu đơn vị" }),
  category: z.string().trim().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]).default("raw_material"),
  min_stock_level: inventoryNonnegativeQuantitySchema.default(0),
  storage_type: z
    .enum(["ambient", "refrigerated", "frozen"])
    .default("ambient"),
  is_active: z.boolean().default(true),
});

type ImportRow = z.infer<typeof importIngredientRowSchema>;

function parseBool(raw: string | undefined): boolean {
  if (!raw) return true;
  const s = raw.trim().toLowerCase();
  if (["", "có", "co", "true", "1", "yes", "x"].includes(s)) return true;
  if (["không", "khong", "false", "0", "no"].includes(s)) return false;
  return true;
}

function parseOptionalNumber(
  raw: string | undefined,
  maxFractionDigits: number,
): { value: number | undefined; error?: string } {
  if (raw == null || raw.trim() === "") return { value: undefined };

  const parsed = parseVietnameseNumericImport(raw, { maxFractionDigits });
  if (parsed.state !== "valid") {
    return {
      value: undefined,
      error: "Số phải theo định dạng vi-VN, ví dụ 1.234,56.",
    };
  }

  return { value: parsed.value };
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

type BulkImportIngredientsRpcClient = {
  rpc: (
    fn: "bulk_import_ingredients",
    args: { p_rows: unknown[] },
  ) => PromiseLike<{
    data: { inserted?: number; updated?: number } | null;
    error: { code?: string; message?: string } | null;
  }>;
};

function mapBulkIngredientImportError(
  code: string | undefined,
  message: string | undefined,
): string {
  if (
    code === PG_ERR.INSUFFICIENT_PRIVILEGE ||
    message?.includes("forbidden")
  ) {
    return "Không có quyền nhập nguyên liệu.";
  }
  if (message?.includes("duplicate_import_name")) {
    return "Tệp có tên nguyên liệu bị trùng.";
  }
  if (message?.includes("unit_not_found")) {
    return "Có đơn vị không còn hợp lệ.";
  }
  if (message?.includes("category_not_found")) {
    return "Có nhóm nguyên liệu không còn hợp lệ.";
  }
  if (message?.includes("bulk_import_base_unit_change_forbidden")) {
    return "Không thể đổi đơn vị chuẩn khi nhập dữ liệu; giữ đơn vị hiện tại hoặc tạo nguyên liệu mới.";
  }
  if (
    message?.includes("ingredient_unit_in_use_by_recipe") ||
    message?.includes("ingredient_unit_in_use_by_production_recipe") ||
    message?.includes("production_recipes_ingredient_entry_unit_fkey")
  ) {
    return "Đơn vị đang dùng trong công thức sản xuất hoặc công thức món; không thể xóa khi nhập dữ liệu.";
  }
  if (code === PG_ERR.UNIQUE_VIOLATION) {
    return "Tên hoặc mã hàng nguyên liệu bị trùng.";
  }
  if (code === PG_ERR.FK_VIOLATION || code === PG_ERR.CHECK_VIOLATION) {
    return "Dữ liệu nhập chưa hợp lệ.";
  }
  return "Không thể nhập nguyên liệu.";
}

export async function importIngredients(
  formData: FormData,
): Promise<ImportIngredientsResult> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Thiếu file dữ liệu" };
  }

  let parsed;
  try {
    parsed = await parseSpreadsheetFile(file, {
      maxRowsPerSheet: MAX_ROWS_PER_SHEET,
    });
  } catch (err) {
    console.error("inventory.ingredients.import_parse_failed", { error: err });
    return {
      success: false,
      error: "Không đọc được file.",
    };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "Tệp trống" };
  }

  const { supabase } = ctx;

  const issues: ImportIngredientIssue[] = [];
  const valid: ImportRow[] = [];

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

    const minStock = parseOptionalNumber(
      raw["Tồn tối thiểu"] ?? raw["Ngưỡng tồn (Min)"] ?? raw["min_stock_level"],
      3,
    );
    if (minStock.error) {
      issues.push({
        row: rowNumber,
        field: "Tồn tối thiểu",
        message: minStock.error,
      });
      return;
    }
    const parsedRow = importIngredientRowSchema.safeParse({
      name: raw["Tên nguyên liệu"] ?? raw["name"],
      sku: (raw["SKU"] ?? raw["sku"] ?? "").trim() || undefined,
      unit: raw["Đơn vị"] ?? raw["unit"],
      category: (raw["Danh mục"] ?? raw["category"] ?? "").trim() || undefined,
      item_kind: kindKey,
      min_stock_level: minStock.value ?? 0,
      storage_type: storageKey,
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

    valid.push(parsedRow.data);
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng lỗi. Vui lòng sửa và thử lại.`,
      issues,
    };
  }

  if (valid.length === 0) {
    return { success: false, error: "Không có dòng hợp lệ nào để nhập" };
  }

  const { data: summary, error: rpcErr } = await (
    supabase as unknown as BulkImportIngredientsRpcClient
  ).rpc("bulk_import_ingredients", {
    p_rows: valid.map((row) => ({
      name: row.name,
      sku: row.sku ?? null,
      unit: row.unit,
      category: row.category ?? null,
      item_kind: row.item_kind,
      min_stock_level: row.min_stock_level,
      max_stock_level: null,
      reorder_point: null,
      storage_type: row.storage_type,
    })),
  });

  if (rpcErr) {
    console.error("inventory.ingredients.bulk_import_failed", {
      code: rpcErr.code,
      message: rpcErr.message,
    });
    return {
      success: false,
      error: mapBulkIngredientImportError(rpcErr.code, rpcErr.message),
    };
  }

  return {
    success: true,
    data: {
      summary: {
        inserted: Number(summary?.inserted ?? 0),
        updated: Number(summary?.updated ?? 0),
      },
    },
  };
}

export async function downloadIngredientTemplate(): Promise<ActionResult> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildIngredientSheets(
    [
      {
        name: "Nước mắm chai (ví dụ)",
        sku: "NM-001",
        category: "Gia vị",
        item_kind: "raw_material",
        min_stock_level: 1000,
        storage_type: "ambient",
        is_active: true,
        units: [
          {
            unit_code: "chai",
            to_base_factor: 1,
            is_base: true,
          },
        ],
      },
    ],
    false,
  );

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: "mau-nguyen-lieu.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx" as const,
    },
  };
}
