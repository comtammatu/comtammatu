import type { TenantSupabase } from "@lib/inventory/types";

type ResolveEntryUnitCodeResult =
  | { success: true; unit: string; unitId: number; toBaseFactor: number }
  | { success: false; error: string };

type IngredientUnitCodeRow = {
  unit_id: number | null;
  to_base_factor: number | string | null;
  units: { code: string | null } | null;
};

export async function resolveEntryUnitCode(
  supabase: TenantSupabase,
  {
    tenantId,
    ingredientId,
    entryUnitId,
  }: {
    tenantId: number;
    ingredientId: number;
    entryUnitId: number | null | undefined;
  },
): Promise<ResolveEntryUnitCodeResult> {
  const query = supabase
    .from("ingredient_units")
    .select("unit_id, to_base_factor, units!ingredient_units_unit_tenant_fkey(code)")
    .eq("tenant_id", tenantId)
    .eq("ingredient_id", ingredientId)
    .eq("is_active", true);

  const { data, error } =
    entryUnitId == null
      ? await query
          .eq("is_base", true)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle()
      : await query.eq("unit_id", entryUnitId).maybeSingle();

  if (error || !data) {
    return { success: false, error: "Đơn vị không thuộc nguyên liệu." };
  }

  const row = data as unknown as IngredientUnitCodeRow;
  const unit = row.units?.code?.trim();
  const toBaseFactor = Number(row.to_base_factor ?? 1);
  return row.unit_id && unit && Number.isFinite(toBaseFactor) && toBaseFactor > 0
    ? { success: true, unit, unitId: row.unit_id, toBaseFactor }
    : { success: false, error: "Đơn vị không thuộc nguyên liệu." };
}
