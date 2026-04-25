import { redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "../../_lib/permissions";
import { fetchExpiryAlerts, fetchIngredients } from "../actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { formatDate } from "../_lib/format";
import { StockClient } from "./stock-client";
import type {
  StockActionPermissions,
  StockIngredient,
  StockMovementHistory,
  StockSupplyBranchOption,
  StockWorkSummary,
} from "./stock-client";

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
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchId = scope.selectedBranchId;
  if (!branchId) redirect("/inventory");

  // Resolve current branch kind so the client can pick PO vs Requisition flow.
  const { data: branchRow } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", branchId)
    .maybeSingle();
  const branchKind = branchRow?.branch_kind ?? "branch";

  // Fetch the stock workbench data in parallel. Extra counts are read-only
  // hints for the compact operations strip.
  const [
    ingredientsRes,
    stockRes,
    expiryAlertsRes,
    pendingGrnRes,
    outboundTransferRes,
    inboundTransferRes,
    movementHistoryRes,
    canReceiveGrn,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canCreatePurchaseOrder,
    canAdjustException,
  ] = await Promise.all([
    fetchIngredients(),
    supabase
      .from("stock_levels")
      .select("ingredient_id, current_quantity, avg_unit_cost, last_counted_at")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .order("ingredient_id"),
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
    supabase
      .from("stock_movements")
      .select(
        "id, ingredient_id, type, movement_subtype, quantity_change, unit_cost, reason, created_at, grn_id, transfer_id, issue_id, order_id, production_order_id",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(300),
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
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

  const role = claims.user_role;
  const canViewTotal =
    role === "owner" ||
    role === "super_manager" ||
    role === "warehouse_manager";
  const canViewBranch =
    canViewTotal || role === "area_manager" || role === "branch_manager";

  const branchValue = canViewBranch
    ? ingredients.reduce((sum, i) => sum + i.qty * i.cost, 0)
    : null;

  let totalValue: number | null = null;
  if (canViewTotal) {
    const { data: tenantRows } = await supabase
      .from("stock_levels")
      .select("current_quantity, avg_unit_cost")
      .eq("tenant_id", claims.tenant_id);
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
    canCreateIssue: canAdjustException,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canCreatePurchaseOrder,
    canAdjustException,
  };
  const movementHistory: StockMovementHistory[] = (
    movementHistoryRes.data ?? []
  ).map((row) => ({
    id: row.id,
    ingredientId: row.ingredient_id,
    type: row.type,
    movementSubtype: row.movement_subtype,
    quantityChange: row.quantity_change,
    unitCost: row.unit_cost,
    reason: row.reason,
    createdAt: row.created_at,
    grnId: row.grn_id,
    transferId: row.transfer_id,
    issueId: row.issue_id,
    orderId: row.order_id,
    productionOrderId: row.production_order_id,
  }));

  // Operational branches need a list of CW/CK to pick as supply source for
  // "Yêu cầu cấp hàng". Procurement branches don't need this list.
  const supplyBranches: StockSupplyBranchOption[] =
    branchKind === "branch"
      ? (await fetchProcurementBranches(supabase, claims.tenant_id))
          .filter((b) => b.id !== branchId)
          .map((b) => ({ id: b.id, name: b.name, branch_kind: b.branch_kind }))
      : [];

  return (
    <StockClient
      ingredients={ingredients}
      branchId={branchId}
      branchKind={branchKind}
      branchValue={branchValue}
      totalValue={totalValue}
      summary={summary}
      permissions={permissions}
      movementHistory={movementHistory}
      supplyBranches={supplyBranches}
    />
  );
}
