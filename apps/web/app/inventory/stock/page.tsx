import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchIngredients } from "../actions";
import {
  parseBranchIdParam,
  resolveInventoryBranchScope,
} from "../_lib/inventory-scope";
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

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const requested = parseBranchIdParam(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchId = scope.selectedBranchId;
  if (!branchId) redirect("/inventory");

  // Fetch ingredients + stock levels in parallel
  const [ingredientsRes, stockRes] = await Promise.all([
    fetchIngredients(),
    supabase
      .from("stock_levels")
      .select("ingredient_id, current_quantity, avg_unit_cost, last_counted_at")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .order("ingredient_id"),
  ]);

  const dbIngredients = ingredientsRes.success
    ? (ingredientsRes.data as Array<{
        id: number;
        name: string;
        sku: string | null;
        unit: string;
        purchase_unit: string;
        category: string | null;
        unit_cost: number | null;
        min_stock_level: number | null;
        max_stock_level: number | null;
        reorder_point: number | null;
        storage_type: string | null;
      }>)
    : [];

  const stockRows = stockRes.data ?? [];
  // Aggregate across locations (warehouse + kitchen) per ingredient.
  const stockMap = new Map<
    number,
    {
      ingredient_id: number;
      current_quantity: number;
      avg_unit_cost: number | null;
      last_counted_at: string | null;
    }
  >();
  for (const s of stockRows) {
    const prev = stockMap.get(s.ingredient_id);
    if (!prev) {
      stockMap.set(s.ingredient_id, { ...s });
      continue;
    }
    const prevQty = prev.current_quantity;
    const addQty = s.current_quantity;
    const totalQty = prevQty + addQty;
    const weighted =
      totalQty > 0
        ? (prevQty * (prev.avg_unit_cost ?? 0) +
            addQty * (s.avg_unit_cost ?? 0)) /
          totalQty
        : (s.avg_unit_cost ?? prev.avg_unit_cost);
    const prevCount = prev.last_counted_at;
    const nextCount = s.last_counted_at;
    const latestCount =
      prevCount && nextCount
        ? prevCount > nextCount
          ? prevCount
          : nextCount
        : (prevCount ?? nextCount);
    stockMap.set(s.ingredient_id, {
      ingredient_id: s.ingredient_id,
      current_quantity: totalQty,
      avg_unit_cost: weighted,
      last_counted_at: latestCount,
    });
  }

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
      unit: row.purchase_unit || row.unit,
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

  return <StockClient ingredients={ingredients} branchId={branchId} />;
}
