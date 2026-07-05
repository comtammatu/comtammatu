import type { IngredientUnitRow } from "./types";

export function getIngredientUnitDisplayName(
  units: IngredientUnitRow[] | undefined,
  entryUnitId: number | null | undefined,
  fallback: string,
): string {
  const activeUnits = (units ?? []).filter((unit) => unit.is_active);
  const selected =
    entryUnitId != null
      ? activeUnits.find((unit) => unit.unit_id === entryUnitId)
      : activeUnits.find((unit) => unit.is_base);
  return selected?.unit_name?.trim() || fallback;
}
