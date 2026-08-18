import type { IngredientUnitRow } from "@lib/inventory/types";

function embeddedObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function getEmbeddedUnitDisplayName(value: unknown): string | null {
  const unit = embeddedObject(value);
  const name = typeof unit?.name === "string" ? unit.name.trim() : "";
  if (name) return name;
  const code = typeof unit?.code === "string" ? unit.code.trim() : "";
  return code || null;
}

export function getEmbeddedIngredientBaseUnitDisplayName(
  value: unknown,
): string | null {
  const ingredient = embeddedObject(value);
  const units = ingredient?.ingredient_units;
  if (!Array.isArray(units)) return null;
  for (const row of units) {
    const unitRow = embeddedObject(row);
    if (unitRow?.is_base === true) {
      return getEmbeddedUnitDisplayName(unitRow.units);
    }
  }
  return null;
}

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
  return (
    selected?.unit_name?.trim() || selected?.unit_code?.trim() || fallback
  );
}
