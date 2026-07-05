import type { TenantSupabase } from "./types";

type ResolveEntryUnitCodeResult =
  | { success: true; unit: string }
  | { success: false; error: string };

type IngredientUnitCodeRow = {
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
    .select("units!ingredient_units_unit_tenant_fkey(code)")
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
  return unit
    ? { success: true, unit }
    : { success: false, error: "Đơn vị không thuộc nguyên liệu." };
}
