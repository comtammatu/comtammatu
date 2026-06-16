"use server";

import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";

const ROLES = PROCUREMENT_ROLES;

/* ─── Recipes (branch WAC + menu-item recipes) ─── */

const recipeLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  note: z.string().optional().nullable(),
  yieldFactor: z.coerce.number().positive().default(1.0),
});

const recipeBatchSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  lines: z.array(recipeLineSchema),
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
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
        ingredient_id, quantity, unit, note, yield_factor,
        ingredients ( id, name, unit, purchase_unit, unit_cost )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("fetchRecipes", error);
    return { success: false, error: "Không thể tải định mức món bán." };
  }
  return { success: true, data: data ?? [] };
}

// WAC = the actual average cost (avg_unit_cost) in branch stock levels.
export async function fetchBranchWacMap(): Promise<
  ActionResult<Record<string, number>>
> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
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
    console.error("fetchBranchWacMap", error);
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

export const upsertRecipeLines = withAction(
  {
    roles: ROLES,
    schema: recipeBatchSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: data.menuItemId,
      p_lines: data.lines.map((l) => ({
        ingredient_id: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        note: l.note ?? null,
        yield_factor: l.yieldFactor,
      })),
    });
    if (error) {
      console.error("upsertRecipeLines", error);
      return { success: false, error: "Không thể lưu định mức món bán." };
    }
    return { success: true };
  },
);

export async function fetchMenuItemsForRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
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
