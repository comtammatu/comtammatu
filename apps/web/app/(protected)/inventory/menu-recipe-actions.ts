"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import { fetchStockBearingLocationIds } from "./_lib/stock-bearing-locations";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import { buildSourceSiteWacMap } from "./_lib/menu-recipe-cost";

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
  };
  const recipeResult =
    menuItemIds.length === 0
      ? { data: [] as MenuRecipeLine[], error: null }
      : await supabase
          .from("recipes")
          .select(
            "menu_item_id, ingredient_id, quantity, entry_unit_id, note",
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
            "ingredient_id, is_base, units!ingredient_units_unit_tenant_fkey ( code )",
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

  const unitsByIngredient = new Map<
    number,
    Array<{ is_base: boolean; units: { code: string } | null }>
  >();
  for (const row of unitResult.data ?? []) {
    const ingredientId = Number(row.ingredient_id);
    const list = unitsByIngredient.get(ingredientId) ?? [];
    const unitsEmbed = row.units as
      | { code: string }
      | { code: string }[]
      | null;
    const unit = Array.isArray(unitsEmbed) ? (unitsEmbed[0] ?? null) : unitsEmbed;
    list.push({
      is_base: row.is_base === true,
      units: unit?.code ? { code: unit.code } : null,
    });
    unitsByIngredient.set(ingredientId, list);
  }

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
            ingredients: null,
          };
        }
        return {
          ingredient_id: menuRecipe.ingredient_id,
          quantity: menuRecipe.quantity,
          entry_unit_id: menuRecipe.entry_unit_id,
          note: menuRecipe.note,
          ingredients: {
            ...ingredient,
            ingredient_units: unitsByIngredient.get(ingredient.id) ?? [],
          },
        };
      },
    ),
  }));
  return { success: true, data: rows };
}

/**
 * Valued WAC for menu-recipe portion cost, keyed by Kho gốc
 * (`central_supply` / `central_kitchen` × ingredient). Zero placeholders are
 * dropped. Callers resolve with ingredients.default_fulfill_site_kind.
 * Fallbacks: live Chi nhánh WAC, then last positive movement at Kho gốc.
 */
export async function fetchBranchWacMap(
  branchId?: number | null,
): Promise<
  ActionResult<{
    monetary: Record<string, number>;
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
    branchId: parsedBranchId.data ?? undefined,
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
      data: { monetary: {}, branchFallback: {}, lastKnownSource: {} },
    };
  }

  let query = monetary.client
    .from("stock_levels")
    .select("ingredient_id, avg_unit_cost, branch_id")
    .eq("tenant_id", claims.tenant_id)
    .in("location_id", stockBearingLocations.locationIds)
    .not("avg_unit_cost", "is", null)
    .gt("avg_unit_cost", 0);

  if (parsedBranchId.data != null) {
    query = query.eq("branch_id", parsedBranchId.data);
  }

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
  }));
  const map = buildSourceSiteWacMap(stockRows);

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
    data: { monetary: map, branchFallback, lastKnownSource },
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
