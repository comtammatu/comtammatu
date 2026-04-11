import { fetchIngredients } from "../actions";
import { formatDate } from "../_lib/format";
import { IngredientsClient } from "./ingredients-client";
import type { IngredientItem } from "./ingredients-client";

function storageTemp(type: string | null): string | null {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return null;
}

export default async function IngredientsPage() {
  const result = await fetchIngredients();

  const dbRows = result.success
    ? (result.data as Array<{
        id: number;
        name: string;
        sku: string | null;
        unit: string;
        category: string | null;
        unit_cost: number | null;
        min_stock_level: number | null;
        max_stock_level: number | null;
        reorder_point: number | null;
        storage_type: string | null;
        is_active: boolean;
        updated_at: string | null;
      }>)
    : [];

  const ingredients: IngredientItem[] = dbRows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku ?? "",
    unit: row.unit,
    category: row.category ?? "",
    cost: row.unit_cost ?? 0,
    min: row.min_stock_level ?? 0,
    max: row.max_stock_level ?? 0,
    reorder: row.reorder_point ?? 0,
    status: row.is_active ? "normal" : "out",
    temp: storageTemp(row.storage_type),
    updatedAt: row.updated_at ? formatDate(row.updated_at) : "—",
  }));

  return <IngredientsClient ingredients={ingredients} />;
}
