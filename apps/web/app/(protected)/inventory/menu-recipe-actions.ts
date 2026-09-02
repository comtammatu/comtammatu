"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import { fetchStockBearingLocationIds } from "./_lib/stock-bearing-locations";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import {
  buildCompanyWacMap,
  buildSourceSiteWacMap,
} from "./_lib/menu-recipe-cost";

const MENU_RECIPES_PATH = "/inventory/menu-recipes";

type RecipeUnitEmbed = {
  ingredient_id: number;
  id: number;
  unit_id: number;
  to_base_factor: number | string | null;
  is_base: boolean;
  is_active: boolean | null;
  sort_order: number | null;
  units:
    | { code: string | null; name: string | null }
    | { code: string | null; name: string | null }[]
    | null;
};

function mapRecipeIngredientUnits(
  rows: readonly RecipeUnitEmbed[],
): Map<number, IngredientUnitRow[]> {
  const map = new Map<number, IngredientUnitRow[]>();
  for (const row of rows) {
    const ingredientId = Number(row.ingredient_id);
    const list = map.get(ingredientId) ?? [];
    const unitsEmbed = row.units;
    const unit = Array.isArray(unitsEmbed)
      ? (unitsEmbed[0] ?? null)
      : unitsEmbed;
    list.push({
      id: Number(row.id),
      unit_id: Number(row.unit_id),
      unit_code: unit?.code ?? "",
      unit_name: unit?.name ?? unit?.code ?? "",
      to_base_factor: Number(row.to_base_factor ?? 1),
      is_base: row.is_base === true,
      is_active: row.is_active !== false,
      sort_order: Number(row.sort_order ?? 0),
    });
    map.set(ingredientId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
  return map;
}

/* ─── Menu recipes (Kho gốc WAC display + recipe line CRUD) ─── */

const branchIdSchema = z.coerce.number().int().positive();
const optionalBranchIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .optional();

const menuRecipeLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  note: z.string().optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

const menuRecipeBatchSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  oldMenuItemId: z.coerce.number().int().positive().optional().nullable(),
  lines: z.array(menuRecipeLineSchema).min(1),
});

export async function fetchMenuRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    INVENTORY_CATALOG_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: menuItems, error: menuError } = await supabase
    .from("menu_items")
    .select(
      `
      id, name, updated_at,
      menu_categories ( name )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (menuError) {
    console.error("inventory.menu_recipe.fetch_failed", {
      error: menuError instanceof Error ? menuError.message : String(menuError),
    });
    return { success: false, error: messages.inventory.menuRecipes.loadFailed };
  }

  const headers = menuItems ?? [];
  const menuItemIds = headers.map((item) => Number(item.id));
  type MenuRecipeLine = {
    menu_item_id: number;
    ingredient_id: number;
    quantity: number;
    entry_unit_id: number | null;
    note: string | null;
    is_primary: boolean;
  };
  const recipeResult =
    menuItemIds.length === 0
      ? { data: [] as MenuRecipeLine[], error: null }
      : await supabase
          .from("recipes")
          .select(
            "menu_item_id, ingredient_id, quantity, entry_unit_id, note, is_primary",
          )
          .eq("tenant_id", claims.tenant_id)
          .in("menu_item_id", menuItemIds);
  if (recipeResult.error) {
    console.error("inventory.menu_recipe.fetch_failed", {
      error: recipeResult.error.message,
    });
    return { success: false, error: messages.inventory.menuRecipes.loadFailed };
  }

  const recipes = (recipeResult.data ?? []) as MenuRecipeLine[];
  const ingredientIds = [
    ...new Set(
      recipes
        .map((recipe) => Number(recipe.ingredient_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const [ingredientResult, unitResult] = await Promise.all([
    ingredientIds.length === 0
      ? { data: [] as Array<Record<string, unknown>>, error: null }
      : supabase
          .from("ingredients")
          .select("id, name")
          .eq("tenant_id", claims.tenant_id)
          .in("id", ingredientIds),
    ingredientIds.length === 0
      ? { data: [] as Array<Record<string, unknown>>, error: null }
      : supabase
          .from("ingredient_units")
          .select(
            "id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey ( code, name )",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .in("ingredient_id", ingredientIds),
  ]);
  if (ingredientResult.error || unitResult.error) {
    console.error("inventory.menu_recipe.fetch_failed", {
      error: ingredientResult.error?.message ?? unitResult.error?.message,
    });
    return { success: false, error: messages.inventory.menuRecipes.loadFailed };
  }

  const unitsByIngredient = mapRecipeIngredientUnits(
    (unitResult.data ?? []) as RecipeUnitEmbed[],
  );

  const ingredientById = new Map<number, { id: number; name: string }>();
  for (const row of ingredientResult.data ?? []) {
    ingredientById.set(Number(row.id), {
      id: Number(row.id),
      name: String(row.name ?? "Nguyên liệu"),
    });
  }

  const recipesByMenuItem = new Map<number, typeof recipes>();
  for (const recipe of recipes) {
    const menuItemId = Number(recipe.menu_item_id);
    const list = recipesByMenuItem.get(menuItemId) ?? [];
    list.push(recipe);
    recipesByMenuItem.set(menuItemId, list);
  }

  const rows = headers.map((menuItem) => ({
    ...menuItem,
    menu_recipes: (recipesByMenuItem.get(Number(menuItem.id)) ?? []).map(
      (menuRecipe) => {
        const ingredient = ingredientById.get(Number(menuRecipe.ingredient_id));
        if (!ingredient) {
          return {
            ingredient_id: menuRecipe.ingredient_id,
            quantity: menuRecipe.quantity,
            entry_unit_id: menuRecipe.entry_unit_id,
            note: menuRecipe.note,
            is_primary: menuRecipe.is_primary ?? false,
            ingredients: null,
          };
        }
        return {
          ingredient_id: menuRecipe.ingredient_id,
          quantity: menuRecipe.quantity,
          entry_unit_id: menuRecipe.entry_unit_id,
          note: menuRecipe.note,
          is_primary: menuRecipe.is_primary ?? false,
          ingredients: {
            ...ingredient,
            units: unitsByIngredient.get(ingredient.id) ?? [],
            ingredient_units: (unitsByIngredient.get(ingredient.id) ?? []).map(
              (unit) => ({
                is_base: unit.is_base,
                units: unit.unit_code ? { code: unit.unit_code } : null,
              }),
            ),
          },
        };
      },
    ),
  }));
  return { success: true, data: rows };
}

/**
 * Tenant-wide company WAC for menu-recipe portion cost (ADR 0040).
 * Zero placeholders are dropped. Callers still pass
 * ingredients.default_fulfill_site_kind for Nguồn hàng; cost is one number.
 */
export async function fetchBranchWacMap(
  branchId?: number | null,
): Promise<
  ActionResult<{
    monetary: Record<string, number>;
    company: Record<number, number>;
    branchFallback: Record<number, number>;
    lastKnownSource: Record<string, number>;
  }>
> {
  const parsedBranchId = optionalBranchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Chi nhánh không hợp lệ." };
  }

  const ctx = await getAuthContextWithPermission(
    INVENTORY_CATALOG_ROLES,
    PERMISSION_KEYS.INVENTORY_VALUATION_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetary.valuation || !monetary.client) {
    return { success: false, error: "Không có quyền" };
  }

  const stockBearingLocations = await fetchStockBearingLocationIds({
    supabase,
    tenantId: claims.tenant_id,
  });
  if (!stockBearingLocations.ok) {
    return {
      success: false,
      error: messages.inventory.menuRecipes.branchWacLoadFailed,
    };
  }
  if (stockBearingLocations.locationIds.length === 0) {
    return {
      success: true,
      data: {
        monetary: {},
        company: {},
        branchFallback: {},
        lastKnownSource: {},
      },
    };
  }

  const query = monetary.client
    .from("stock_levels")
    .select("ingredient_id, avg_unit_cost, branch_id, current_quantity")
    .eq("tenant_id", claims.tenant_id)
    .in("location_id", stockBearingLocations.locationIds)
    .not("avg_unit_cost", "is", null)
    .gt("avg_unit_cost", 0);

  const [stockResult, branchesResult, lastKnownResult] = await Promise.all([
    query,
    supabase
      .from("branches")
      .select("id, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true),
    monetary.client
      .from("stock_movements")
      .select("ingredient_id, unit_cost, branch_id, created_at")
      .eq("tenant_id", claims.tenant_id)
      .gt("unit_cost", 0)
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);

  if (stockResult.error) {
    console.error("inventory.menu_recipe.fetch_branch_wac_map_failed", {
      error:
        stockResult.error instanceof Error
          ? stockResult.error.message
          : String(stockResult.error),
    });
    return {
      success: false,
      error: messages.inventory.menuRecipes.branchWacLoadFailed,
    };
  }
  if (branchesResult.error) {
    console.error("inventory.menu_recipe.fetch_branch_kinds_failed", {
      error:
        branchesResult.error instanceof Error
          ? branchesResult.error.message
          : String(branchesResult.error),
    });
    return {
      success: false,
      error: messages.inventory.menuRecipes.branchWacLoadFailed,
    };
  }

  type WacRow = {
    ingredient_id: number;
    avg_unit_cost: number | string | null;
    branch_id: number;
    current_quantity?: number | string | null;
  };
  const branchKindById = new Map(
    (branchesResult.data ?? []).map((branch) => [
      Number(branch.id),
      branch.branch_kind as string | null,
    ]),
  );
  const stockRows = ((stockResult.data ?? []) as WacRow[]).map((row) => ({
    ingredientId: row.ingredient_id,
    branchKind: branchKindById.get(Number(row.branch_id)) ?? null,
    avgUnitCost: row.avg_unit_cost,
    currentQuantity: row.current_quantity,
  }));
  const map = buildSourceSiteWacMap(stockRows);
  const company = buildCompanyWacMap(stockRows);

  const branchFallbackAccum = new Map<number, { sum: number; count: number }>();
  for (const row of stockRows) {
    if (row.branchKind !== "branch") continue;
    const cost = Number(row.avgUnitCost);
    if (!(typeof cost === "number" && Number.isFinite(cost) && cost > 0)) {
      continue;
    }
    const id = Number(row.ingredientId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const entry = branchFallbackAccum.get(id) ?? { sum: 0, count: 0 };
    entry.sum += cost;
    entry.count += 1;
    branchFallbackAccum.set(id, entry);
  }
  const branchFallback: Record<number, number> = {};
  for (const [id, entry] of branchFallbackAccum) {
    branchFallback[id] = entry.sum / entry.count;
  }

  const lastKnownSource: Record<string, number> = {};
  if (!lastKnownResult.error) {
    type MoveRow = {
      ingredient_id: number;
      unit_cost: number | string | null;
      branch_id: number;
    };
    for (const row of (lastKnownResult.data ?? []) as MoveRow[]) {
      const kind = branchKindById.get(Number(row.branch_id));
      if (kind !== "central_supply" && kind !== "central_kitchen") continue;
      const id = Number(row.ingredient_id);
      const cost = Number(row.unit_cost);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!(typeof cost === "number" && Number.isFinite(cost) && cost > 0)) {
        continue;
      }
      const key = `${kind}:${id}`;
      if (lastKnownSource[key] != null) continue;
      lastKnownSource[key] = cost;
    }
  }

  return {
    success: true,
    data: { monetary: map, company, branchFallback, lastKnownSource },
  };
}

// Live menu recipe × warehouse stock = sellable portions per dish.
export async function fetchBranchMenuStockCapacity(
  branchId: number,
): Promise<ActionResult<Record<string, number>>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Chi nhánh không hợp lệ." };
  }

  const ctx = await getAuthContextWithPermission(
    INVENTORY_OPS_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_branch_menu_stock_capacity", {
    p_branch_id: parsedBranchId.data,
  });

  if (error) {
    console.error("inventory.menu_recipe.fetch_branch_stock_capacity_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: messages.inventory.menuRecipes.capacityLoadFailed,
    };
  }

  const map: Record<string, number> = {};
  if (Array.isArray(data)) {
    for (const row of data as Array<{
      menu_item_id: number;
      stock_capacity: number;
    }>) {
      map[String(row.menu_item_id)] = Number(row.stock_capacity);
    }
  }
  return { success: true, data: map };
}

export const upsertMenuRecipeLines = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: menuRecipeBatchSchema,
    anyPermission: [...CATALOG_MANAGE_PERMISSIONS, PERMISSION_KEYS.MENU_WRITE],
  },
  async (data, { supabase, claims }) => {
    const ingredientIds = [
      ...new Set(data.lines.map((line) => line.ingredientId)),
    ];
    const { data: configuredUnits, error: configuredUnitsError } =
      await supabase
        .from("ingredient_units")
        .select("ingredient_id, unit_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .in("ingredient_id", ingredientIds);
    if (configuredUnitsError) {
      return {
        success: false,
        error: messages.inventory.menuRecipes.saveFailed,
      };
    }

    const unitsByIngredient = new Map<number, Set<number>>();
    for (const unit of configuredUnits ?? []) {
      const set = unitsByIngredient.get(unit.ingredient_id) ?? new Set();
      set.add(unit.unit_id);
      unitsByIngredient.set(unit.ingredient_id, set);
    }
    if (
      data.lines.some((line) => {
        const allowed = unitsByIngredient.get(line.ingredientId);
        return (
          allowed == null ||
          allowed.size === 0 ||
          line.entryUnitId == null ||
          !allowed.has(line.entryUnitId)
        );
      })
    ) {
      return {
        success: false,
        error: messages.inventory.menuRecipes.entryUnitRequired,
      };
    }

    const lines = data.lines.map((line) => ({
      ingredient_id: line.ingredientId,
      quantity: line.quantity,
      entry_unit_id: line.entryUnitId ?? null,
      note: line.note ?? null,
      is_primary: line.isPrimary ?? false,
    }));

    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: data.menuItemId,
      p_lines: lines,
      p_old_menu_item_id: data.oldMenuItemId ?? undefined,
    });
    if (error) {
      console.error("inventory.menu_recipe.upsert_lines_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: messages.inventory.menuRecipes.saveFailed,
      };
    }

    revalidatePath(MENU_RECIPES_PATH);
    return { success: true };
  },
);

export async function fetchMenuItemsForMenuRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    INVENTORY_CATALOG_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, is_active")
    .eq("tenant_id", claims.tenant_id)
    .order("name");
  if (error)
    return {
      success: false,
      error: messages.inventory.menuRecipes.menuItemsLoadFailed,
    };
  return { success: true, data: data ?? [] };
}
