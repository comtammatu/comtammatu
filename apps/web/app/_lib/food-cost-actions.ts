"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "./auth";
import {
  buildFoodCostRows,
  foodCostUnitCostKey,
  type FoodCostRecipeLine,
  type FoodCostResultRow,
  type FoodCostSaleLine,
} from "./food-cost-calculation";
import type { IngredientUnitRow } from "@lib/inventory/types";

const REPORT_ROLES: readonly StaffRole[] = ["owner"];
const foodCostCopy = messages.finance.foodCost;

const fetchFoodCostSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

export async function fetchFoodCost(
  input?: z.infer<typeof fetchFoodCostSchema>,
): Promise<ActionResult<FoodCostResultRow[]>> {
  const parsed = fetchFoodCostSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Tham số không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;
  const tenantId = ctx.claims.tenant_id;
  const branchId = parsed.data.branchId;
  const startIso = parsed.data.startDate
    ? getVNDayUtcRange(parsed.data.startDate).startIso
    : null;
  const endIso = parsed.data.endDate
    ? getVNDayUtcRange(parsed.data.endDate).endIso
    : null;

  // Per-(branch, menu item) sale totals aggregated in SQL under one permission
  // check, instead of paging every order_items row through PostgREST (each page
  // paid per-row RLS; long ranges also silently truncated at the 1000-row cap).
  // Recipe/unit-cost math stays in TS below against the small recipes table.
  const { data: salesRows, error: salesError } = await supabase.rpc(
    "get_menu_item_sales_agg",
    {
      p_branch_id: branchId ?? undefined,
      p_from: startIso ?? undefined,
      p_to: endIso ?? undefined,
    },
  );
  if (salesError) {
    return { success: false, error: foodCostCopy.loadSalesFailed };
  }

  const saleLines: FoodCostSaleLine[] = (salesRows ?? [])
    .filter((row) => row.branch_id != null && row.menu_item_id != null)
    .map((row) => ({
      branchId: row.branch_id as number,
      menuItemId: row.menu_item_id as number,
      itemName: row.item_name,
      quantity: Number(row.quantity_sold ?? 0),
      revenue: Number(row.revenue ?? 0),
    }));

  const menuItemIds = [...new Set(saleLines.map((row) => row.menuItemId))];
  if (menuItemIds.length === 0) return { success: true, data: [] };

  const { data: recipeData, error: recipeError } = await supabase
    .from("recipes")
    .select(
      `
      menu_item_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      yield_factor,
      ingredients (
        unit_cost,
        ingredient_units!ingredient_units_ingredient_tenant_fkey (
          id,
          unit_id,
          to_base_factor,
          is_base,
          is_active,
          sort_order,
          units!ingredient_units_unit_tenant_fkey ( code, name )
        )
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .in("menu_item_id", menuItemIds);

  if (recipeError) {
    return { success: false, error: foodCostCopy.loadRecipeFailed };
  }

  type UnitRelation = { code: string | null; name: string | null } | null;
  type IngredientUnitData = {
    id: number | null;
    unit_id: number | null;
    to_base_factor: number | string | null;
    is_base: boolean | null;
    is_active: boolean | null;
    sort_order: number | null;
    units: UnitRelation | UnitRelation[];
  };
  type IngredientRelation = {
    unit_cost: number | string | null;
    ingredient_units: IngredientUnitData[] | null;
  } | null;
  type RecipeDataRow = {
    menu_item_id: number | null;
    ingredient_id: number | null;
    quantity: number | string | null;
    entry_unit_id: number | null;
    yield_factor: number | string | null;
    ingredients: IngredientRelation | IngredientRelation[];
  };

  const ingredientIds = new Set<number>();
  const recipeLines: FoodCostRecipeLine[] = [];
  for (const row of (recipeData ?? []) as unknown as RecipeDataRow[]) {
    if (row.menu_item_id == null || row.ingredient_id == null) continue;
    const ingredient = Array.isArray(row.ingredients)
      ? row.ingredients[0]
      : row.ingredients;
    const units: IngredientUnitRow[] = (ingredient?.ingredient_units ?? []).map(
      (unit) => {
        const rawUnit = Array.isArray(unit.units) ? unit.units[0] : unit.units;
        return {
          id: Number(unit.id ?? 0),
          unit_id: Number(unit.unit_id ?? 0),
          unit_code: rawUnit?.code ?? "",
          unit_name: rawUnit?.name ?? null,
          to_base_factor: Number(unit.to_base_factor ?? 1),
          is_base: unit.is_base === true,
          is_active: unit.is_active !== false,
          sort_order: Number(unit.sort_order ?? 0),
        };
      },
    );
    ingredientIds.add(row.ingredient_id);
    recipeLines.push({
      menuItemId: row.menu_item_id,
      ingredientId: row.ingredient_id,
      quantity: Number(row.quantity ?? 0),
      entryUnitId: row.entry_unit_id,
      yieldFactor: Number(row.yield_factor ?? 1),
      fallbackUnitCost: Number(ingredient?.unit_cost ?? 0),
      units,
    });
  }

  const unitCosts = new Map<string, number>();
  const branchIds = [...new Set(saleLines.map((row) => row.branchId))];
  if (ingredientIds.size > 0 && branchIds.length > 0) {
    const { data: locationData, error: locationError } = await supabase
      .from("inventory_locations")
      .select("id, branch_id")
      .eq("tenant_id", tenantId)
      .eq("location_kind", "warehouse")
      .eq("is_active", true)
      .in("branch_id", branchIds);

    if (locationError) {
      return { success: false, error: foodCostCopy.loadWacFailed };
    }

    const warehouseLocationIds = (locationData ?? []).map((row) => row.id);
    if (warehouseLocationIds.length === 0) {
      return {
        success: true,
        data: buildFoodCostRows({
          saleLines,
          recipeLines,
          unitCosts,
          periodStart: parsed.data.startDate ?? null,
        }),
      };
    }

    const { data: stockData, error: stockError } = await supabase
      .from("stock_levels")
      .select("branch_id, ingredient_id, avg_unit_cost")
      .eq("tenant_id", tenantId)
      .in("branch_id", branchIds)
      .in("location_id", warehouseLocationIds)
      .in("ingredient_id", [...ingredientIds])
      .not("avg_unit_cost", "is", null);

    if (stockError) {
      return { success: false, error: foodCostCopy.loadWacFailed };
    }

    type StockCostRow = {
      branch_id: number | null;
      ingredient_id: number | null;
      avg_unit_cost: number | string | null;
    };
    for (const row of (stockData ?? []) as StockCostRow[]) {
      if (row.branch_id == null || row.ingredient_id == null) continue;
      const key = foodCostUnitCostKey(row.branch_id, row.ingredient_id);
      unitCosts.set(key, Number(row.avg_unit_cost ?? 0));
    }
  }

  return {
    success: true,
    data: buildFoodCostRows({
      saleLines,
      recipeLines,
      unitCosts,
      periodStart: parsed.data.startDate ?? null,
    }),
  };
}
