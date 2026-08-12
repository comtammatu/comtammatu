import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchStockBearingLocationIds } from "@/(protected)/inventory/_lib/stock-bearing-locations";
import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  computeStockIngredientDetailStatus,
  stockStorageTemperature,
  type StockIngredientDetailData,
  type StockIngredientDetailLocation,
  type StockIngredientDetailMovement,
} from "./stock-on-hand-detail-model";
import { loadInventoryMonetaryAccess } from "./monetary-access";
import {
  resolveStockDisplayUnit,
  toStockDisplayUnitCost,
} from "@/(protected)/inventory/_lib/stock-unit-format";

type UnitRef = { code: string; name: string | null };

type IngredientUnitJoin = {
  unit_id: number;
  to_base_factor: number | null;
  is_base: boolean;
  is_active: boolean;
  units: UnitRef | UnitRef[] | null;
};

type IngredientRow = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit_cost?: number | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
  ingredient_units: IngredientUnitJoin[] | null;
};

type LocationRef = {
  name: string;
  code: string;
  location_kind: string;
  branches?: { name: string } | { name: string }[] | null;
};

type StockLevelRow = {
  location_id: number;
  current_quantity: number;
  avg_unit_cost?: number | null;
  last_counted_at: string | null;
  inventory_locations: LocationRef | LocationRef[] | null;
};

type MovementRow = {
  id: number;
  type: string;
  movement_subtype: string | null;
  quantity_change: number;
  unit_cost?: number | null;
  reason: string | null;
  created_at: string;
  grn_id: number | null;
  transfer_id: number | null;
  issue_id: number | null;
  order_id: number | null;
  production_run_id: number | null;
  inventory_locations: LocationRef | LocationRef[] | null;
};

interface LoadStockIngredientDetailDataOptions {
  ingredientId: number;
  includeValuation?: boolean;
  movementLimit?: number;
  queryBranch?: string | string[];
  routeBranchId?: number;
}

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function ingredientSelect(includeValuation: boolean): string {
  return [
    "id",
    "name",
    "sku",
    "category",
    includeValuation ? "unit_cost" : null,
    "min_stock_level",
    "max_stock_level",
    "reorder_point",
    "storage_type",
    "ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, is_active, units!ingredient_units_unit_tenant_fkey(code, name))",
  ]
    .filter((field): field is string => Boolean(field))
    .join(", ");
}

function stockLevelSelect(includeValuation: boolean, withBranch = false): string {
  const locationJoin = withBranch
    ? "inventory_locations ( name, code, location_kind, branches!inventory_locations_branch_id_fkey ( name ) )"
    : "inventory_locations ( name, code, location_kind )";
  return [
    "location_id",
    "current_quantity",
    includeValuation ? "avg_unit_cost" : null,
    "last_counted_at",
    locationJoin,
  ]
    .filter((field): field is string => Boolean(field))
    .join(", ");
}

function mapStockLevelRows(
  rows: StockLevelRow[],
  canReadValuation: boolean,
  withBranch: boolean,
): StockIngredientDetailLocation[] {
  return rows.map((row) => {
    const location = relatedOne(row.inventory_locations);
    const branch = withBranch ? relatedOne(location?.branches) : null;
    return {
      locationId: row.location_id,
      name: location?.name ?? `#${row.location_id}`,
      code: location?.code ?? "",
      locationKind: location?.location_kind ?? "unknown",
      branchName: branch?.name,
      qty: Number(row.current_quantity ?? 0),
      monetary: canReadValuation
        ? { avgUnitCost: row.avg_unit_cost ?? null }
        : null,
      lastCountedAt: row.last_counted_at,
    };
  });
}

function sortSystemLocations(
  rows: StockIngredientDetailLocation[],
): StockIngredientDetailLocation[] {
  return [...rows].sort((left, right) => {
    const branchDelta = (left.branchName ?? "").localeCompare(
      right.branchName ?? "",
      "vi",
    );
    if (branchDelta !== 0) return branchDelta;
    return left.name.localeCompare(right.name, "vi");
  });
}

function movementSelect(includeValuation: boolean): string {
  return [
    "id",
    "type",
    "movement_subtype",
    "quantity_change",
    includeValuation ? "unit_cost" : null,
    "reason",
    "created_at",
    "grn_id",
    "transfer_id",
    "issue_id",
    "order_id",
    "production_run_id",
    "inventory_locations ( name, code, location_kind )",
  ]
    .filter((field): field is string => Boolean(field))
    .join(", ");
}

export async function loadStockIngredientDetailData({
  ingredientId,
  includeValuation = true,
  movementLimit = 30,
  queryBranch,
  routeBranchId,
}: LoadStockIngredientDetailDataOptions): Promise<StockIngredientDetailData> {
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch,
  });
  if (scope.outOfScope) notFound();

  const branchId = scope.selectedBranchId;
  if (!branchId) notFound();
  const isOwner = claims.user_role === "owner";
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const canReadValuation = includeValuation && monetary.valuation;
  const readClient = canReadValuation
    ? (monetary.client ?? supabase)
    : supabase;

  const [
    stockBearingLocations,
    tenantStockBearingLocations,
    ingredientResult,
    canCreateStockRequest,
    canReceiveGrn,
    canManagePurchaseRequest,
    canCreateTransfer,
    canCreateStocktake,
    canCreateIssue,
    canWriteoff,
  ] = await Promise.all([
    fetchStockBearingLocationIds({
      supabase: readClient,
      tenantId: claims.tenant_id,
      branchId,
    }),
    isOwner
      ? fetchStockBearingLocationIds({
          supabase: readClient,
          tenantId: claims.tenant_id,
        })
      : Promise.resolve({ ok: true as const, locationIds: [] }),
    readClient
      .from("ingredients")
      .select(ingredientSelect(canReadValuation))
      .eq("tenant_id", claims.tenant_id)
      .eq("id", ingredientId)
      .maybeSingle(),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_REQUEST_CREATE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITEOFF),
  ]);

  if (ingredientResult.error || !ingredientResult.data) notFound();
  const ingredientRow = ingredientResult.data as unknown as IngredientRow;
  const movementCount = Math.min(Math.max(Math.trunc(movementLimit), 1), 30);
  const stockBearingLocationIds = stockBearingLocations.ok
    ? stockBearingLocations.locationIds
    : [];
  const tenantStockBearingLocationIds =
    isOwner && tenantStockBearingLocations.ok
      ? tenantStockBearingLocations.locationIds
      : [];

  const [stockResult, systemStockResult, movementResult] = await Promise.all([
    stockBearingLocations.ok && stockBearingLocationIds.length > 0
      ? readClient
          .from("stock_levels")
          .select(stockLevelSelect(canReadValuation))
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .eq("ingredient_id", ingredientId)
          .in("location_id", stockBearingLocationIds)
          .order("location_id")
      : Promise.resolve({ data: [], error: null }),
    isOwner && tenantStockBearingLocationIds.length > 0
      ? readClient
          .from("stock_levels")
          .select(stockLevelSelect(canReadValuation, true))
          .eq("tenant_id", claims.tenant_id)
          .eq("ingredient_id", ingredientId)
          .in("location_id", tenantStockBearingLocationIds)
          .order("location_id")
      : Promise.resolve({ data: [], error: null }),
    readClient
      .from("stock_movements")
      .select(movementSelect(canReadValuation))
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: false })
      .limit(movementCount),
  ]);

  const units: IngredientUnitRow[] = (ingredientRow.ingredient_units ?? []).map(
    (unit) => {
      const ref = relatedOne(unit.units);
      return {
        id: 0,
        unit_id: unit.unit_id,
        unit_code: ref?.code ?? "",
        unit_name: ref?.name ?? ref?.code ?? "",
        to_base_factor: Number(unit.to_base_factor ?? 1),
        is_base: unit.is_base,
        is_active: unit.is_active,
        sort_order: 0,
      };
    },
  );
  const standardUnit = resolveStockDisplayUnit(units);
  const unit =
    standardUnit?.unit_name?.trim() ||
    standardUnit?.unit_code ||
    "";
  const stockRows = (stockResult.data ?? []) as unknown as StockLevelRow[];
  const systemStockRows = (systemStockResult.data ?? []) as unknown as StockLevelRow[];
  const movementRows = (movementResult.data ?? []) as unknown as MovementRow[];
  const locations = mapStockLevelRows(stockRows, canReadValuation, false);
  const systemLocations = isOwner
    ? sortSystemLocations(
        mapStockLevelRows(systemStockRows, canReadValuation, true),
      )
    : undefined;
  const movements: StockIngredientDetailMovement[] = movementRows.map((row) => {
    const location = relatedOne(row.inventory_locations);
    return {
      id: row.id,
      type: row.type,
      movementSubtype: row.movement_subtype,
      quantityChange: Number(row.quantity_change ?? 0),
      monetary: canReadValuation
        ? { unitCost: row.unit_cost ?? null }
        : null,
      reason: row.reason,
      createdAt: row.created_at,
      grnId: row.grn_id,
      transferId: row.transfer_id,
      issueId: row.issue_id,
      orderId: row.order_id,
      productionRunId: row.production_run_id,
      locationName: location?.name ?? null,
      locationCode: location?.code ?? null,
    };
  });
  const totalQty = locations.reduce((sum, location) => sum + location.qty, 0);
  const latestCountedAt = locations.reduce<string | null>(
    (latest, location) => {
      if (!location.lastCountedAt) return latest;
      if (!latest) return location.lastCountedAt;
      return location.lastCountedAt > latest ? location.lastCountedAt : latest;
    },
    null,
  );
  const referenceUnitCost = canReadValuation
    ? Number(ingredientRow.unit_cost ?? 0)
    : 0;
  const totalValue = canReadValuation
    ? locations.reduce(
        (sum, location) =>
          sum +
          location.qty *
            (location.monetary?.avgUnitCost ?? referenceUnitCost),
        0,
      )
    : null;
  const ledgerWac =
    totalQty > 0 ? (totalValue ?? 0) / totalQty : referenceUnitCost;
  // WAC is a base/standard-unit figure per docs/ref/inventory.md §2.1/§6; never
  // convert it into the quantity-dependent compact pack so two rows compare on
  // the same denominator regardless of on-hand level.
  const valuation =
    totalValue == null
      ? null
      : {
          totalValue,
          wac: toStockDisplayUnitCost(ledgerWac, standardUnit) ?? ledgerWac,
        };
  const min = Number(ingredientRow.min_stock_level ?? 0);
  const max = Number(ingredientRow.max_stock_level ?? 0);
  const reorder = Number(ingredientRow.reorder_point ?? 0);

  return {
    branchId,
    coreDataLoadFailed:
      !stockBearingLocations.ok ||
      stockResult.error != null ||
      movementResult.error != null ||
      (isOwner &&
        (!tenantStockBearingLocations.ok || systemStockResult.error != null)),
    ingredient: {
      id: ingredientRow.id,
      name: ingredientRow.name,
      sku: ingredientRow.sku ?? "",
      category: ingredientRow.category ?? "",
      unit,
      units,
      min,
      max,
      reorder,
      storageType: ingredientRow.storage_type,
    },
    locations,
    systemLocations,
    movements,
    totalQty,
    latestCountedAt,
    status: computeStockIngredientDetailStatus(totalQty, min),
    storageTemperature: stockStorageTemperature(ingredientRow.storage_type),
    valuation,
    permissions: {
      canCreateStockRequest,
      canReceiveGrn,
      canManagePurchaseRequest,
      canCreateTransfer,
      canCreateStocktake,
      canCreateIssue,
      canWriteoff,
    },
  };
}
