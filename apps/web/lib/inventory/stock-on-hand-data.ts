import "server-only";

import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { normalizeInventoryLocationNameVi } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { formatDate } from "@/(protected)/inventory/_lib/format";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchStockBearingLocationIds } from "@/(protected)/inventory/_lib/stock-bearing-locations";
import type { IngredientUnitRow } from "@/(protected)/inventory/_lib/types";
import {
  computeStockStatus,
  isStockReorderRisk,
  type StockActionPermissions,
  type StockIngredient,
  type StockLocationBreakdown,
  type StockOnHandPageData,
  type StockWorkSummary,
} from "./stock-on-hand-model";

type StockLevelLocationRow = {
  id: number;
  name: string | null;
  code: string | null;
  location_kind: string | null;
};

type StockLevelRow = {
  ingredient_id: number;
  location_id: number;
  current_quantity: number;
  avg_unit_cost: number | null;
  last_counted_at: string | null;
  inventory_locations: StockLevelLocationRow | StockLevelLocationRow[] | null;
};

type TenantStockLevelRow = {
  current_quantity: number | null;
  avg_unit_cost: number | null;
  ingredients:
    | { unit_cost: number | null }
    | { unit_cost: number | null }[]
    | null;
};

type StockIngredientRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  item_kind: string | null;
  unit_cost: number | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
  is_active: boolean;
  units?: IngredientUnitRow[];
};

interface LoadStockOnHandPageDataOptions {
  includeValuation?: boolean;
  queryBranchId?: string | string[];
  routeBranchId?: number;
}

const LOCATION_KIND_ORDER: Record<string, number> = {
  warehouse: 0,
  kitchen: 1,
  receiving: 2,
  production_storage: 3,
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function locationKindRank(locationKind: string): number {
  return LOCATION_KIND_ORDER[locationKind] ?? 99;
}

function inventoryLineValue(
  quantityBase: number | null,
  avgUnitCost: number | null,
  referenceUnitCost: number | null,
): number {
  return (quantityBase ?? 0) * (avgUnitCost ?? referenceUnitCost ?? 0);
}

function storageTemp(type: string | null): string | null {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return null;
}

export async function loadStockOnHandPageData({
  includeValuation = true,
  queryBranchId,
  routeBranchId,
}: LoadStockOnHandPageDataOptions = {}): Promise<StockOnHandPageData> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  if (scope.outOfScope) notFound();

  const branchId = scope.selectedBranchId;
  if (!branchId) redirect("/inventory");

  const stockBearingLocationIds = await fetchStockBearingLocationIds({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
  });

  const [
    ingredientsResult,
    stockResult,
    pendingGrnResult,
    outboundTransferResult,
    inboundTransferResult,
    canReceiveGrn,
    canReceiveTransfer,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canAdjustException,
  ] = await Promise.all([
    fetchIngredients(),
    stockBearingLocationIds.length > 0
      ? supabase
          .from("stock_levels")
          .select(
            "ingredient_id, location_id, current_quantity, avg_unit_cost, last_counted_at, inventory_locations ( id, name, code, location_kind )",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .in("location_id", stockBearingLocationIds)
          .order("ingredient_id")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("goods_received_notes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "draft"),
    supabase
      .from("stock_transfers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("from_branch_id", branchId)
      .in("status", ["draft", "confirmed_ship"]),
    supabase
      .from("stock_transfers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("to_branch_id", branchId)
      .in("status", ["in_transit", "confirmed_receive"]),
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITEOFF),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITE),
  ]);

  const dbIngredients = ingredientsResult.success
    ? (ingredientsResult.data as StockIngredientRow[])
    : [];
  const stockRows = (stockResult.data ?? []) as StockLevelRow[];
  const stockMap = new Map<
    number,
    {
      ingredientId: number;
      currentQuantity: number;
      avgUnitCost: number | null;
      lastCountedAt: string | null;
    }
  >();
  const locationMap = new Map<number, StockLocationBreakdown[]>();

  for (const row of stockRows) {
    const location = relatedOne(row.inventory_locations);
    const locations = locationMap.get(row.ingredient_id) ?? [];
    locations.push({
      locationId: row.location_id,
      name:
        normalizeInventoryLocationNameVi(location?.name) ||
        location?.code ||
        `#${row.location_id}`,
      code: location?.code ?? "",
      locationKind: location?.location_kind ?? "unknown",
      qty: row.current_quantity,
      avgUnitCost: row.avg_unit_cost,
      lastCountedAt: row.last_counted_at,
    });
    locationMap.set(row.ingredient_id, locations);

    const previous = stockMap.get(row.ingredient_id);
    if (!previous) {
      stockMap.set(row.ingredient_id, {
        ingredientId: row.ingredient_id,
        currentQuantity: row.current_quantity,
        avgUnitCost: row.avg_unit_cost,
        lastCountedAt: row.last_counted_at,
      });
      continue;
    }

    const totalQuantity = previous.currentQuantity + row.current_quantity;
    const weightedCost =
      totalQuantity > 0
        ? (previous.currentQuantity * (previous.avgUnitCost ?? 0) +
            row.current_quantity * (row.avg_unit_cost ?? 0)) /
          totalQuantity
        : (row.avg_unit_cost ?? previous.avgUnitCost);
    const latestCount =
      previous.lastCountedAt && row.last_counted_at
        ? previous.lastCountedAt > row.last_counted_at
          ? previous.lastCountedAt
          : row.last_counted_at
        : (previous.lastCountedAt ?? row.last_counted_at);

    stockMap.set(row.ingredient_id, {
      ingredientId: row.ingredient_id,
      currentQuantity: totalQuantity,
      avgUnitCost: weightedCost,
      lastCountedAt: latestCount,
    });
  }

  for (const locations of locationMap.values()) {
    locations.sort((left, right) => {
      const kindDifference =
        locationKindRank(left.locationKind) -
        locationKindRank(right.locationKind);
      if (kindDifference !== 0) return kindDifference;
      return left.name.localeCompare(right.name, "vi");
    });
  }

  const ingredients: StockIngredient[] = dbIngredients
    .filter((row) => {
      const currentQuantity = stockMap.get(row.id)?.currentQuantity ?? 0;
      return row.is_active || currentQuantity > 0;
    })
    .map((row) => {
      const stock = stockMap.get(row.id);
      const qty = stock?.currentQuantity ?? 0;
      const referenceCost = row.unit_cost ?? 0;
      const cost = stock?.avgUnitCost ?? referenceCost;
      const min = row.min_stock_level ?? 0;
      const max = row.max_stock_level ?? 0;
      const reorder = row.reorder_point ?? 0;

      return {
        id: row.id,
        name: row.name,
        sku: row.sku ?? "",
        unit: row.unit,
        units: row.units,
        category: row.category ?? "",
        itemKind: row.item_kind ?? "raw_material",
        qty,
        cost,
        referenceCost,
        min,
        max,
        reorder,
        status: computeStockStatus(qty, min, max),
        lastCount: stock?.lastCountedAt ? formatDate(stock.lastCountedAt) : "—",
        temp: storageTemp(row.storage_type),
        locationBreakdown: locationMap.get(row.id) ?? [],
      };
    });

  const role = claims.user_role;
  const canViewTotal = role === "owner";
  const canViewBranch = canViewTotal || role === "branch_manager";
  const branchValue =
    includeValuation && canViewBranch
      ? ingredients.reduce(
          (sum, ingredient) => sum + ingredient.qty * ingredient.cost,
          0,
        )
      : null;

  let totalValue: number | null = null;
  if (includeValuation && canViewTotal) {
    const tenantStockBearingLocationIds = await fetchStockBearingLocationIds({
      supabase,
      tenantId: claims.tenant_id,
    });
    const { data: tenantRows } =
      tenantStockBearingLocationIds.length > 0
        ? await supabase
            .from("stock_levels")
            .select(
              "current_quantity, avg_unit_cost, ingredients ( unit_cost )",
            )
            .eq("tenant_id", claims.tenant_id)
            .in("location_id", tenantStockBearingLocationIds)
        : { data: [] };
    totalValue = ((tenantRows ?? []) as TenantStockLevelRow[]).reduce(
      (sum, row) =>
        sum +
        inventoryLineValue(
          row.current_quantity,
          row.avg_unit_cost,
          relatedOne(row.ingredients)?.unit_cost ?? null,
        ),
      0,
    );
  }

  const underThresholdCount = ingredients.filter(isStockReorderRisk).length;
  const pendingGrnCount = pendingGrnResult.count ?? 0;
  const pendingTransferCount =
    (outboundTransferResult.count ?? 0) + (inboundTransferResult.count ?? 0);
  const summary: StockWorkSummary = {
    underThresholdCount,
    pendingGrnCount,
    pendingTransferCount,
    pendingWorkCount: pendingGrnCount + pendingTransferCount,
  };
  const permissions: StockActionPermissions = {
    canReceiveGrn,
    canReceiveTransfer,
    canCreateIssue: canAdjustException,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canAdjustException,
  };

  return {
    branchId,
    branchValue,
    coreDataLoadFailed: !ingredientsResult.success || stockResult.error != null,
    ingredients,
    permissions,
    summary,
    totalValue,
  };
}
