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

/* ─── Menu recipes (branch WAC + menu-item ingredient consumption) ─── */

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
  const { claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetary.purchasePrice || !monetary.client) {
    return { success: false, error: "Không có quyền" };
  }
  const { data, error } = await monetary.client
    .from("menu_items")
    .select(
      `
      id, name, updated_at,
      menu_categories ( name ),
      menu_recipes:recipes (
        ingredient_id, quantity, entry_unit_id, note,
        ingredients (
          id,
          name,
          ingredient_units!ingredient_units_ingredient_tenant_fkey (
            is_base,
            units!ingredient_units_unit_tenant_fkey ( code )
          ),
          unit_cost
        )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("inventory.menu_recipe.fetch_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: messages.inventory.menuRecipes.loadFailed };
  }
  const rows = (data ?? []).map((menuItem) => ({
    ...menuItem,
    menu_recipes: (menuItem.menu_recipes ?? []).map((menuRecipe) => {
      const ingredient = menuRecipe.ingredients;
      if (!ingredient) return menuRecipe;
      const { unit_cost, ...safeIngredient } = ingredient;
      return {
        ...menuRecipe,
        ingredients: {
          ...safeIngredient,
          monetary: {
            unitCost: unit_cost == null ? null : Number(unit_cost),
          },
        },
      };
    }),
  }));
  return { success: true, data: rows };
}

// WAC = the actual average cost (avg_unit_cost) in branch stock levels.
export async function fetchBranchWacMap(
  branchId?: number | null,
): Promise<ActionResult<{ monetary: Record<string, number> }>> {
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
    return { success: true, data: { monetary: {} } };
  }

  let query = monetary.client
    .from("stock_levels")
    .select("ingredient_id, avg_unit_cost, branch_id")
    .eq("tenant_id", claims.tenant_id)
    .in("location_id", stockBearingLocations.locationIds)
    .not("avg_unit_cost", "is", null);

  if (parsedBranchId.data != null) {
    query = query.eq("branch_id", parsedBranchId.data);
  }

  const { data, error } = await query;

  if (error) {
    console.error("inventory.menu_recipe.fetch_branch_wac_map_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: messages.inventory.menuRecipes.branchWacLoadFailed,
    };
  }

  type WacRow = {
    ingredient_id: number;
    avg_unit_cost: number | string | null;
  };
  const accum = new Map<number, { sum: number; count: number }>();
  for (const row of (data ?? []) as WacRow[]) {
    const id = Number(row.ingredient_id);
    const wac = Number(row.avg_unit_cost ?? 0);
    const entry = accum.get(id) ?? { sum: 0, count: 0 };
    entry.sum += wac;
    entry.count += 1;
    accum.set(id, entry);
  }

  const map: Record<string, number> = {};
  for (const [id, e] of accum) {
    map[String(id)] = e.sum / e.count;
  }
  return { success: true, data: { monetary: map } };
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
