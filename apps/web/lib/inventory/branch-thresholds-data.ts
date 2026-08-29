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

export async function loadBranchStockThresholdsData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const { data: rpcData, error: rpcError } = await (supabase.rpc as unknown as (
    fn: string,
    args: { p_branch_id: number },
  ) => Promise<{ data: RpcThresholdRow[] | null; error: { message: string } | null }>)(
    "get_branch_stock_thresholds",
    { p_branch_id: routeBranchId },
  );

  if (!rpcError && Array.isArray(rpcData)) {
    const rows: BranchStockThresholdRow[] = rpcData.map((item) => ({
      ingredientId: Number(item.ingredient_id),
      ingredientName: String(item.ingredient_name ?? ""),
      sku: item.sku ? String(item.sku) : null,
      categoryName: item.category_name ? String(item.category_name) : null,
      baseUnitId: item.base_unit_id ? Number(item.base_unit_id) : null,
      baseUnitCode: item.base_unit_code ? String(item.base_unit_code) : null,
      baseUnitName: item.base_unit_name ? String(item.base_unit_name) : null,
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
    }));

    return {
      branchId: routeBranchId,
      loadFailed: false,
      rows,
    };
  }

  // Fallback: Query directly from tables if RPC is not yet applied
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
      category:ingredient_categories(name),
      receipt_unit:units!ingredients_receipt_unit_id_fkey(id, code, name)
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
  const rows: BranchStockThresholdRow[] = (ingredients as unknown as IngredientQueryResult[]).map((ing) => {
    const category = ing.category as unknown as { name?: string } | null;
    const receiptUnit = ing.receipt_unit as unknown as { id?: number; code?: string; name?: string } | null;
    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      sku: ing.sku,
      categoryName: category?.name ?? null,
      baseUnitId: receiptUnit?.id ?? null,
      baseUnitCode: receiptUnit?.code ?? null,
      baseUnitName: receiptUnit?.name ?? null,
      globalMinStock: Number(ing.min_stock_level ?? 0),
      branchMinStock: null,
      effectiveMinStock: Number(ing.min_stock_level ?? 0),
      reorderQuantity: null,
      isCustomized: false,
      fulfillFromCentralKitchen: Boolean(ing.fulfill_from_central_kitchen),
      fulfillFromCentralSupply: Boolean(ing.fulfill_from_central_supply),
      defaultFulfillSiteKind: ing.default_fulfill_site_kind,
    };
  });

  return {
    branchId: routeBranchId,
    loadFailed: false,
    rows,
  };
}
