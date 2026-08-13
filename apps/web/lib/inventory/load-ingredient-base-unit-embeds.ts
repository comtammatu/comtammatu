import "server-only";

import type { TenantSupabase } from "./types";

export type IngredientBaseUnitEmbed = {
  is_base: boolean;
  units: { code: string | null; name: string | null } | null;
};

export async function loadIngredientBaseUnitEmbeds(params: {
  supabase: TenantSupabase;
  tenantId: number;
  ingredientIds: number[];
}): Promise<Map<number, IngredientBaseUnitEmbed[]>> {
  const byIngredient = new Map<number, IngredientBaseUnitEmbed[]>();
  const ids = [...new Set(params.ingredientIds.filter((id) => id > 0))];
  if (ids.length === 0) return byIngredient;

  const { data, error } = await params.supabase
    .from("ingredient_units")
    .select(
      "ingredient_id, is_base, units!ingredient_units_unit_tenant_fkey ( code, name )",
    )
    .eq("tenant_id", params.tenantId)
    .eq("is_active", true)
    .eq("is_base", true)
    .in("ingredient_id", ids);
  if (error || data == null) return byIngredient;

  for (const row of data) {
    const ingredientId = Number(row.ingredient_id);
    const unitsEmbed = row.units as
      | { code: string | null; name: string | null }
      | { code: string | null; name: string | null }[]
      | null;
    const unit = Array.isArray(unitsEmbed) ? (unitsEmbed[0] ?? null) : unitsEmbed;
    const list = byIngredient.get(ingredientId) ?? [];
    list.push({ is_base: true, units: unit });
    byIngredient.set(ingredientId, list);
  }
  return byIngredient;
}

export function attachIngredientBaseUnitEmbeds<
  T extends { ingredient_id?: unknown; ingredients?: unknown },
>(
  rows: T[],
  unitsByIngredient: Map<number, IngredientBaseUnitEmbed[]>,
): T[] {
  for (const row of rows) {
    const ingredientId = Number(row.ingredient_id);
    const raw = row.ingredients;
    const ingredient = Array.isArray(raw)
      ? ((raw[0] as Record<string, unknown> | undefined) ?? null)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : null;
    if (!ingredient) continue;
    ingredient.ingredient_units = unitsByIngredient.get(ingredientId) ?? [];
    row.ingredients = ingredient as T["ingredients"];
  }
  return rows;
}
