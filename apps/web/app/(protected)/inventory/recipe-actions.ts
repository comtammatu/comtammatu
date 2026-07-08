"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  INVENTORY_OPS_ROLES,
  INVENTORY_CATALOG_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";

/* ─── Recipes (branch WAC + menu-item recipes) ─── */

const branchIdSchema = z.coerce.number().int().positive();

const recipeLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  note: z.string().optional().nullable(),
  yieldFactor: z.coerce.number().positive().default(1.0),
});

const recipeBatchSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  oldMenuItemId: z.coerce.number().int().positive().optional().nullable(),
  lines: z.array(recipeLineSchema),
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    INVENTORY_CATALOG_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
      id, name, updated_at,
      menu_categories ( name ),
      recipes (
        ingredient_id, quantity, entry_unit_id, note, yield_factor,
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
    console.error("inventory.recipe.fetch_recipes_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể tải định mức món bán." };
  }
  return { success: true, data: data ?? [] };
}

// WAC = the actual average cost (avg_unit_cost) in branch stock levels.
export async function fetchBranchWacMap(): Promise<
  ActionResult<Record<string, number>>
> {
  const ctx = await getAuthContextWithPermission(
    INVENTORY_OPS_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_levels")
    .select("ingredient_id, avg_unit_cost, branches!inner ( branch_kind )")
    .eq("tenant_id", claims.tenant_id)
    .eq("branches.branch_kind", "branch")
    .not("avg_unit_cost", "is", null);

  if (error) {
    console.error("inventory.recipe.fetch_branch_wac_map_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể tải WAC chi nhánh." };
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
  return { success: true, data: map };
}

// Live recipe × warehouse-stock sellable portions per dish for one branch.
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
    console.error("inventory.recipe.fetch_branch_menu_stock_capacity_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể tải phần bán được." };
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

export const upsertRecipeLines = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: recipeBatchSchema,
    anyPermission: [
      ...CATALOG_MANAGE_PERMISSIONS,
      PERMISSION_KEYS.MENU_WRITE,
    ],
  },
  async (data, { supabase }) => {
    const lines = data.lines.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        entry_unit_id: line.entryUnitId ?? null,
        note: line.note ?? null,
        yield_factor: line.yieldFactor,
      }));

    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: data.menuItemId,
      p_lines: lines,
      p_old_menu_item_id: data.oldMenuItemId ?? undefined,
    });
    if (error) {
      console.error("inventory.recipe.upsert_recipe_lines_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: "Không thể lưu định mức món bán." };
    }

    return { success: true };
  },
);

export async function fetchMenuItemsForRecipes(): Promise<ActionResult> {
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
  if (error) return { success: false, error: "Không thể tải món." };
  return { success: true, data: data ?? [] };
}
