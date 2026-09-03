import "server-only";

import type { IngredientUnitRow, TenantSupabase } from "@lib/inventory/types";

export type IntraSiteLocationKind = "warehouse" | "kitchen";

export interface IntraSiteTransferLocation {
  id: number;
  name: string;
  kind: IntraSiteLocationKind;
}

export interface IntraSiteTransferIngredient {
  ingredientId: number;
  name: string;
  baseUnitId: number;
  unit: string;
  warehouseQuantity: number;
  kitchenQuantity: number;
  units?: IngredientUnitRow[];
}

export interface IntraSiteTransferData {
  branchId: number;
  warehouse: IntraSiteTransferLocation;
  kitchen: IntraSiteTransferLocation;
  ingredients: IntraSiteTransferIngredient[];
}

type LocationRow = {
  id: number;
  name: string;
  location_kind: string;
};

type StockRow = {
  location_id: number;
  ingredient_id: number;
  current_quantity: number | string;
};

type IngredientRow = { id: number; name: string };
type UnitRow = {
  id: number;
  ingredient_id: number;
  unit_id: number;
  to_base_factor: number;
  is_base: boolean;
  is_active: boolean;
  sort_order: number;
  units:
    | { code: string | null; name: string | null }
    | Array<{ code: string | null; name: string | null }>
    | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function loadIntraSiteTransferData({
  supabase,
  tenantId,
  branchId,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  branchId: number;
}): Promise<IntraSiteTransferData | null> {
  const { data: rawLocations, error: locationsError } = await supabase
    .from("inventory_locations")
    .select("id, name, location_kind")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .in("location_kind", ["warehouse", "kitchen"]);
  if (locationsError) throw new Error("inventory.intra_site.locations_failed");

  const locations = (rawLocations ?? []) as unknown as LocationRow[];
  const warehouse = locations.find(
    (location) => location.location_kind === "warehouse",
  );
  const kitchen = locations.find(
    (location) => location.location_kind === "kitchen",
  );
  if (!warehouse || !kitchen) return null;

  const locationIds = [warehouse.id, kitchen.id];
  const { data: rawStock, error: stockError } = await supabase
    .from("stock_levels")
    .select("location_id, ingredient_id, current_quantity")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .in("location_id", locationIds);
  if (stockError) throw new Error("inventory.intra_site.stock_failed");

  const stock = (rawStock ?? []) as unknown as StockRow[];
  const ingredientIds = [...new Set(stock.map((row) => row.ingredient_id))];
  if (ingredientIds.length === 0) {
    return {
      branchId,
      warehouse: { id: warehouse.id, name: warehouse.name, kind: "warehouse" },
      kitchen: { id: kitchen.id, name: kitchen.name, kind: "kitchen" },
      ingredients: [],
    };
  }

  const [ingredientsResult, unitsResult] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("id", ingredientIds),
    supabase
      .from("ingredient_units")
      .select(
        "id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name)",
      )
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("ingredient_id", ingredientIds)
      .order("sort_order", { ascending: true }),
  ]);
  if (ingredientsResult.error || unitsResult.error) {
    throw new Error("inventory.intra_site.catalog_failed");
  }

  const ingredients = (ingredientsResult.data ??
    []) as unknown as IngredientRow[];
  const units = (unitsResult.data ?? []) as unknown as UnitRow[];
  const unitsByIngredient = new Map<number, IngredientUnitRow[]>();
  for (const row of units) {
    const unitObj = relatedOne(row.units);
    const unitRow: IngredientUnitRow = {
      id: row.id,
      unit_id: row.unit_id,
      unit_code: unitObj?.code ?? "",
      unit_name: unitObj?.name ?? unitObj?.code ?? "",
      to_base_factor: Number(row.to_base_factor ?? 1),
      is_base: Boolean(row.is_base),
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    };
    const list = unitsByIngredient.get(row.ingredient_id) ?? [];
    list.push(unitRow);
    unitsByIngredient.set(row.ingredient_id, list);
  }

  const quantityByKey = new Map(
    stock.map((row) => [
      `${row.location_id}:${row.ingredient_id}`,
      Number(row.current_quantity),
    ]),
  );

  return {
    branchId,
    warehouse: { id: warehouse.id, name: warehouse.name, kind: "warehouse" },
    kitchen: { id: kitchen.id, name: kitchen.name, kind: "kitchen" },
    ingredients: ingredients
      .flatMap<IntraSiteTransferIngredient>((ingredient) => {
        const ingredientUnits = unitsByIngredient.get(ingredient.id) ?? [];
        const baseUnit =
          ingredientUnits.find((unit) => unit.is_base) ?? ingredientUnits[0];
        if (!baseUnit) return [];
        return [
          {
            ingredientId: ingredient.id,
            name: ingredient.name,
            baseUnitId: baseUnit.unit_id,
            unit: baseUnit.unit_name?.trim() || baseUnit.unit_code || "unit",
            warehouseQuantity:
              quantityByKey.get(`${warehouse.id}:${ingredient.id}`) ?? 0,
            kitchenQuantity:
              quantityByKey.get(`${kitchen.id}:${ingredient.id}`) ?? 0,
            units: ingredientUnits,
          },
        ];
      })
      .sort((left, right) => left.name.localeCompare(right.name, "vi")),
  };
}
