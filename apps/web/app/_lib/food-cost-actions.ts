"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { getAuthContextWithPermission } from "./auth";
import {
  aggregateFoodCostRowsByMenuItem,
  buildFoodCostRows,
  type FoodCostMenuRecipeLine,
  type FoodCostResultRow,
  type FoodCostSaleLine,
} from "./food-cost-calculation";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { fetchStockBearingLocationIds } from "../(protected)/inventory/_lib/stock-bearing-locations";
import {
  buildSourceSiteWacMap,
  resolveMenuRecipeUnitCost,
} from "../(protected)/inventory/_lib/menu-recipe-cost";

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

  const { supabase, claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetary.valuation || !monetary.client) {
    return { success: false, error: "Không có quyền" };
  }
  const monetaryClient = monetary.client;
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

  const { data: menuRecipeData, error: menuRecipeError } = await monetaryClient
    .from("recipes")
    .select(
      `
      menu_item_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      ingredients (
        default_fulfill_site_kind,
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

  if (menuRecipeError) {
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
    default_fulfill_site_kind?: string | null;
    ingredient_units: IngredientUnitData[] | null;
  } | null;
  type MenuRecipeDataRow = {
    menu_item_id: number | null;
    ingredient_id: number | null;
    quantity: number | string | null;
    entry_unit_id: number | null;
    ingredients: IngredientRelation | IngredientRelation[];
  };

  const stockBearing = await fetchStockBearingLocationIds({
    supabase,
    tenantId,
  });
  if (!stockBearing.ok) {
    return { success: false, error: foodCostCopy.loadWacFailed };
  }

  let sourceSiteWacMap: Record<string, number> = {};
  const branchFallbackWacMap: Record<number, number> = {};
  const lastKnownSourceWacMap: Record<string, number> = {};

  if (stockBearing.locationIds.length > 0) {
    const [stockResult, branchesResult, lastKnownResult] = await Promise.all([
      monetaryClient
        .from("stock_levels")
        .select("ingredient_id, avg_unit_cost, branch_id")
        .eq("tenant_id", tenantId)
        .in("location_id", stockBearing.locationIds)
        .not("avg_unit_cost", "is", null)
        .gt("avg_unit_cost", 0),
      supabase
        .from("branches")
        .select("id, branch_kind")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      monetaryClient
        .from("stock_movements")
        .select("ingredient_id, unit_cost, branch_id, created_at")
        .eq("tenant_id", tenantId)
        .gt("unit_cost", 0)
        .order("created_at", { ascending: false })
        .limit(3000),
    ]);

    if (stockResult.error || branchesResult.error) {
      return { success: false, error: foodCostCopy.loadWacFailed };
    }

    type WacRow = {
      ingredient_id: number;
      avg_unit_cost: number | string | null;
      branch_id: number;
    };
    const branchKindById = new Map(
      (branchesResult.data ?? []).map((branch) => [
        Number(branch.id),
        branch.branch_kind as string | null,
      ]),
    );
    const stockRows = ((stockResult.data ?? []) as WacRow[]).map((row) => ({
      ingredientId: row.ingredient_id,
      branchKind: branchKindById.get(Number(row.branch_id)) ?? null,
      avgUnitCost: row.avg_unit_cost,
    }));
    sourceSiteWacMap = buildSourceSiteWacMap(stockRows);

    const branchFallbackAccum = new Map<
      number,
      { sum: number; count: number }
    >();
    for (const row of stockRows) {
      if (row.branchKind !== "branch") continue;
      const cost = Number(row.avgUnitCost);
      if (!(typeof cost === "number" && Number.isFinite(cost) && cost > 0)) {
        continue;
      }
      const id = Number(row.ingredientId);
      if (!Number.isFinite(id) || id <= 0) continue;
      const entry = branchFallbackAccum.get(id) ?? { sum: 0, count: 0 };
      entry.sum += cost;
      entry.count += 1;
      branchFallbackAccum.set(id, entry);
    }
    for (const [id, entry] of branchFallbackAccum) {
      branchFallbackWacMap[id] = entry.sum / entry.count;
    }

    if (!lastKnownResult.error) {
      type MoveRow = {
        ingredient_id: number;
        unit_cost: number | string | null;
        branch_id: number;
      };
      for (const row of (lastKnownResult.data ?? []) as MoveRow[]) {
        const kind = branchKindById.get(Number(row.branch_id));
        if (kind !== "central_supply" && kind !== "central_kitchen") continue;
        const id = Number(row.ingredient_id);
        const cost = Number(row.unit_cost);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (!(typeof cost === "number" && Number.isFinite(cost) && cost > 0)) {
          continue;
        }
        const key = `${kind}:${id}`;
        if (lastKnownSourceWacMap[key] != null) continue;
        lastKnownSourceWacMap[key] = cost;
      }
    }
  }

  const menuRecipeLines: FoodCostMenuRecipeLine[] = [];
  for (const row of (menuRecipeData ?? []) as unknown as MenuRecipeDataRow[]) {
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
    menuRecipeLines.push({
      menuItemId: row.menu_item_id,
      ingredientId: row.ingredient_id,
      quantity: Number(row.quantity ?? 0),
      entryUnitId: row.entry_unit_id,
      resolvedUnitCost: resolveMenuRecipeUnitCost({
        ingredientId: row.ingredient_id,
        sourceSiteKind: ingredient?.default_fulfill_site_kind,
        sourceSiteWacMap,
        branchFallbackWacMap,
        lastKnownSourceWacMap,
      }),
      units,
    });
  }

  return {
    success: true,
    data: aggregateFoodCostRowsByMenuItem(
      buildFoodCostRows({
        saleLines,
        menuRecipeLines,
        periodStart: parsed.data.startDate ?? null,
      }),
    ),
  };
}
