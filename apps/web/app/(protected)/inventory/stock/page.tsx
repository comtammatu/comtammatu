import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { fetchExpiryAlerts } from "../alert-actions";
import { fetchIngredients } from "../ingredient-actions";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { fetchStockBearingLocationIds } from "../_lib/stock-bearing-locations";
import { formatDate } from "../_lib/format";
import { StockClient } from "./stock-client";
import type {
  StockActionPermissions,
  StockIngredient,
  StockWorkSummary,
} from "./stock-client";
import type { IngredientUnitRow } from "../_lib/types";

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

interface StockPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  branchStockBasePath?: string;
  embedded?: boolean;
}

export async function StockPageContent({
  searchParams,
  routeBranchId,
  branchStockBasePath,
  embedded = false,
}: StockPageContentProps) {
  const { supabase, claims } = await loadAuthState();
  const params = searchParams ? await searchParams : {};
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const branchId = scope.selectedBranchId;
  if (!branchId) redirect("/inventory");
  const stockBearingLocationIds = await fetchStockBearingLocationIds({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
  });

  // Fetch the stock workbench data in parallel. Extra counts are read-only
  // hints for the compact operations strip.
  const [
    ingredientsRes,
    stockRes,
    expiryAlertsRes,
    pendingGrnRes,
    outboundTransferRes,
    inboundTransferRes,
    canReceiveGrn,
    canReceiveTransfer,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canCreatePurchaseOrder,
    canAdjustException,
  ] = await Promise.all([
    fetchIngredients(),
    stockBearingLocationIds.length > 0
      ? supabase
          .from("stock_levels")
          .select(
            "ingredient_id, current_quantity, avg_unit_cost, last_counted_at",
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .in("location_id", stockBearingLocationIds)
          .order("ingredient_id")
      : Promise.resolve({ data: [], error: null }),
    fetchExpiryAlerts(branchId),
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
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITE),
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
        units?: IngredientUnitRow[];
      }>)
    : [];

  const stockRows = stockRes.data ?? [];
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
      units: row.units,
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

  const role = claims.user_role;
  const canViewTotal = role === "owner" || role === "warehouse_manager";
  const canViewBranch = canViewTotal || role === "branch_manager";

  const branchValue = canViewBranch
    ? ingredients.reduce((sum, i) => sum + i.qty * i.cost, 0)
    : null;

  let totalValue: number | null = null;
  if (canViewTotal) {
    const tenantStockBearingLocationIds = await fetchStockBearingLocationIds({
      supabase,
      tenantId: claims.tenant_id,
    });
    const { data: tenantRows } =
      tenantStockBearingLocationIds.length > 0
        ? await supabase
            .from("stock_levels")
            .select("current_quantity, avg_unit_cost")
            .eq("tenant_id", claims.tenant_id)
            .in("location_id", tenantStockBearingLocationIds)
        : { data: [] };
    totalValue = (tenantRows ?? []).reduce(
      (sum, r) => sum + (r.current_quantity ?? 0) * (r.avg_unit_cost ?? 0),
      0,
    );
  }

  const underThresholdCount = ingredients.filter(
    (ingredient) =>
      ingredient.status === "out" ||
      ingredient.status === "low" ||
      ingredient.qty <= ingredient.reorder,
  ).length;
  const expiryCount =
    expiryAlertsRes.success && Array.isArray(expiryAlertsRes.data)
      ? expiryAlertsRes.data.length
      : 0;
  const pendingGrnCount = pendingGrnRes.count ?? 0;
  const pendingTransferCount =
    (outboundTransferRes.count ?? 0) + (inboundTransferRes.count ?? 0);
  const summary: StockWorkSummary = {
    underThresholdCount,
    expiryCount,
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
    canCreatePurchaseOrder,
    canAdjustException,
  };
  return (
    <StockClient
      ingredients={ingredients}
      branchId={branchId}
      branchValue={branchValue}
      totalValue={totalValue}
      summary={summary}
      permissions={permissions}
      branchStockBasePath={branchStockBasePath}
      embedded={embedded}
    />
  );
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <StockPageContent searchParams={searchParams} />;
}
