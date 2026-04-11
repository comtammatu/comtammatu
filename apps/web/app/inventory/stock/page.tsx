import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { fetchIngredients } from "../actions";
import { formatDate } from "../_lib/format";
import { StockClient } from "./stock-client";
import type { StockIngredient } from "./stock-client";

function computeStatus(
  qty: number,
  min: number,
  reorder: number,
  max: number,
): StockIngredient["status"] {
  if (qty <= 0) return "out";
  if (qty < min) return "low";
  if (max > 0 && qty > max) return "over";
  return "normal";
}

function storageTemp(type: string | null): string | null {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return null;
}

export default async function StockPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");
  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  // Fetch ingredients + stock levels for HQ branch in parallel
  const [ingredientsRes, stockRes] = await Promise.all([
    fetchIngredients(),
    supabase
      .from("stock_levels")
      .select("ingredient_id, current_quantity, avg_unit_cost, last_counted_at")
      .eq("tenant_id", claims.tenant_id)
      .order("ingredient_id"),
  ]);

  const dbIngredients = ingredientsRes.success
    ? (ingredientsRes.data as Array<{
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
      }>)
    : [];

  const stockRows = stockRes.data ?? [];
  const stockMap = new Map(stockRows.map((s) => [s.ingredient_id, s]));

  const ingredients: StockIngredient[] = dbIngredients.map((row) => {
    const sl = stockMap.get(row.id);
    const qty = sl?.current_quantity ?? 0;
    const cost = sl?.avg_unit_cost ?? row.unit_cost ?? 0;
    const min = row.min_stock_level ?? 0;
    const max = row.max_stock_level ?? 0;
    const reorder = row.reorder_point ?? 0;

    return {
      id: row.id,
      name: row.name,
      sku: row.sku ?? "",
      unit: row.unit,
      category: row.category ?? "",
      qty,
      cost,
      min,
      max,
      reorder,
      status: computeStatus(qty, min, reorder, max),
      lastCount: sl?.last_counted_at ? formatDate(sl.last_counted_at) : "—",
      temp: storageTemp(row.storage_type),
    };
  });

  return <StockClient ingredients={ingredients} />;
}
