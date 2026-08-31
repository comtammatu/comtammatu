import "server-only";

import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";

export type BranchStockThresholdRow = {
  ingredientId: number;
  ingredientName: string;
  sku: string | null;
  categoryName: string | null;
  baseUnitId: number | null;
  baseUnitCode: string | null;
  baseUnitName: string | null;
  globalMinStock: number;
  branchMinStock: number | null;
  effectiveMinStock: number;
  reorderQuantity: number | null;
  isCustomized: boolean;
  fulfillFromCentralKitchen: boolean;
  fulfillFromCentralSupply: boolean;
  defaultFulfillSiteKind: string | null;
};

type RpcThresholdRow = {
  ingredient_id: number;
  ingredient_name?: string | null;
  sku?: string | null;
  category_name?: string | null;
  base_unit_id?: number | null;
  base_unit_code?: string | null;
  base_unit_name?: string | null;
  global_min_stock?: number | null;
  branch_min_stock?: number | null;
  effective_min_stock?: number | null;
  reorder_quantity?: number | null;
  is_customized?: boolean | null;
  fulfill_from_central_kitchen?: boolean | null;
  fulfill_from_central_supply?: boolean | null;
  default_fulfill_site_kind?: string | null;
};

type BaseUnitRow = {
  ingredient_id: number;
  unit_id: number;
  units:
    | { code: string | null; name: string | null }
    | { code: string | null; name: string | null }[]
    | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadBranchStockThresholdsData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const { data: rpcData, error: rpcError } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: { p_branch_id: number },
    ) => Promise<{
      data: RpcThresholdRow[] | null;
      error: { message: string } | null;
    }>
  )("get_branch_stock_thresholds", { p_branch_id: routeBranchId });

  const baseUnitsResult = await supabase
    .from("ingredient_units")
    .select(
      "ingredient_id, unit_id, units!ingredient_units_unit_tenant_fkey(code, name)",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("is_base", true);
  const baseUnits = new Map(
    ((baseUnitsResult.data ?? []) as unknown as BaseUnitRow[]).map((row) => {
      const unit = relatedOne(row.units);
      return [
        row.ingredient_id,
        {
          id: row.unit_id,
          code: unit?.code ?? null,
          name: unit?.name ?? null,
        },
      ] as const;
    }),
  );
  const branchThresholdsResult = await supabase
    .from("branch_ingredient_thresholds")
    .select("ingredient_id, min_stock_level, reorder_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .eq("is_active", true);

  if (!rpcError && Array.isArray(rpcData)) {
    const rows: BranchStockThresholdRow[] = rpcData.map((item) => {
      const baseUnit = baseUnits.get(Number(item.ingredient_id));
      return {
        ingredientId: Number(item.ingredient_id),
        ingredientName: String(item.ingredient_name ?? ""),
        sku: item.sku ? String(item.sku) : null,
        categoryName: item.category_name ? String(item.category_name) : null,
        baseUnitId: baseUnit?.id ?? null,
        baseUnitCode: baseUnit?.code ?? null,
        baseUnitName: baseUnit?.name ?? null,
        globalMinStock: Number(item.global_min_stock ?? 0),
        branchMinStock:
          item.branch_min_stock !== null && item.branch_min_stock !== undefined
            ? Number(item.branch_min_stock)
            : null,
        effectiveMinStock: Number(item.effective_min_stock ?? 0),
        reorderQuantity:
          item.reorder_quantity !== null && item.reorder_quantity !== undefined
            ? Number(item.reorder_quantity)
            : null,
        isCustomized: Boolean(item.is_customized),
        fulfillFromCentralKitchen: Boolean(item.fulfill_from_central_kitchen),
        fulfillFromCentralSupply: Boolean(item.fulfill_from_central_supply),
        defaultFulfillSiteKind: item.default_fulfill_site_kind
          ? String(item.default_fulfill_site_kind)
          : null,
      };
    });

    return {
      branchId: routeBranchId,
      loadFailed: baseUnitsResult.error != null,
      rows,
    };
  }

  // Fallback: Query directly from tables if RPC is not yet applied
  if (branchThresholdsResult.error) {
    return {
      branchId: routeBranchId,
      loadFailed: true,
      rows: [] as BranchStockThresholdRow[],
    };
  }

  const branchThresholds = new Map(
    (branchThresholdsResult.data ?? []).map((row) => [
      row.ingredient_id,
      {
        minStock: Number(row.min_stock_level),
        reorderQuantity:
          row.reorder_quantity == null ? null : Number(row.reorder_quantity),
      },
    ]),
  );
  const { data: ingredients, error: ingError } = await supabase
    .from("ingredients")
    .select(
      `
      id,
      name,
      sku,
      min_stock_level,
      fulfill_from_central_kitchen,
      fulfill_from_central_supply,
      default_fulfill_site_kind,
      category:ingredient_categories(name)
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (ingError || !ingredients) {
    return {
      branchId: routeBranchId,
      loadFailed: true,
      rows: [] as BranchStockThresholdRow[],
    };
  }

  type IngredientQueryResult = (typeof ingredients)[number];
  const rows: BranchStockThresholdRow[] = (
    ingredients as unknown as IngredientQueryResult[]
  ).map((ing) => {
    const category = ing.category as unknown as { name?: string } | null;
    const baseUnit = baseUnits.get(ing.id);
    const branchThreshold = branchThresholds.get(ing.id);
    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      sku: ing.sku,
      categoryName: category?.name ?? null,
      baseUnitId: baseUnit?.id ?? null,
      baseUnitCode: baseUnit?.code ?? null,
      baseUnitName: baseUnit?.name ?? null,
      globalMinStock: Number(ing.min_stock_level ?? 0),
      branchMinStock: branchThreshold?.minStock ?? null,
      effectiveMinStock:
        branchThreshold?.minStock ?? Number(ing.min_stock_level ?? 0),
      reorderQuantity: branchThreshold?.reorderQuantity ?? null,
      isCustomized: branchThreshold != null,
      fulfillFromCentralKitchen: Boolean(ing.fulfill_from_central_kitchen),
      fulfillFromCentralSupply: Boolean(ing.fulfill_from_central_supply),
      defaultFulfillSiteKind: ing.default_fulfill_site_kind,
    };
  });

  return {
    branchId: routeBranchId,
    loadFailed: baseUnitsResult.error != null,
    rows,
  };
}
