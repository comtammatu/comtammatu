import "server-only";

import { formatInventoryLocationLabelVi } from "@comtammatu/shared/labels";
import type { loadAuthState } from "@/_lib/auth";
import { isStockBearingLocationKind } from "@/(protected)/inventory/_lib/stock-bearing-locations";
import {
  loadStockRequestDetail,
  type StockRequestDetailData,
} from "./stock-request-detail-data";
import { getStockJourney } from "./stock-journey-model";
import type {
  StockRequestFulfillGroup,
  StockRequestFulfillLine,
} from "./stock-request-fulfillment-model";

export type {
  StockRequestFulfillGroup,
  StockRequestFulfillLine,
} from "./stock-request-fulfillment-model";
export {
  isFulfillLineShort,
  lineOnHandInEntryUnit,
  onHandInEntryUnit,
} from "./stock-request-fulfillment-model";

type AuthState = Awaited<ReturnType<typeof loadAuthState>>;
type FulfillSiteKind = StockRequestFulfillGroup["fulfillSiteKind"];

export type StockRequestFulfillmentDetailData = {
  data: StockRequestDetailData;
  groups: StockRequestFulfillGroup[];
  canClose: boolean;
};

async function loadSourceBranchId(
  supabase: AuthState["supabase"],
  tenantId: number,
  siteKind: FulfillSiteKind,
  actorBranchId: number | null,
  isOwner: boolean,
): Promise<number | null> {
  if (!isOwner && actorBranchId != null) return actorBranchId;
  const { data } = await supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_kind", siteKind)
    .eq("is_active", true)
    .order("id")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function loadLocations(
  supabase: AuthState["supabase"],
  tenantId: number,
  branchId: number,
): Promise<Array<{ id: number; label: string }>> {
  const [{ data: branch }, { data: locations }] = await Promise.all([
    supabase
      .from("branches")
      .select("name, branch_kind")
      .eq("tenant_id", tenantId)
      .eq("id", branchId)
      .maybeSingle(),
    supabase
      .from("inventory_locations")
      .select("id, location_kind")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("is_default_issue", { ascending: false })
      .order("sort_order"),
  ]);
  return (locations ?? [])
    .filter((location) =>
      isStockBearingLocationKind({
        siteKind: branch?.branch_kind,
        locationKind: location.location_kind,
      }),
    )
    .map((location) => ({
      id: location.id,
      label: formatInventoryLocationLabelVi({
        branchName: branch?.name,
        siteKind: branch?.branch_kind,
        locationKind: location.location_kind,
      }),
    }));
}

async function loadToBaseFactors(
  supabase: AuthState["supabase"],
  tenantId: number,
  items: Array<{ ingredientId: number; entryUnitId: number }>,
): Promise<Map<string, number>> {
  const ingredientIds = [...new Set(items.map((item) => item.ingredientId))];
  const unitIds = [...new Set(items.map((item) => item.entryUnitId))];
  const factors = new Map<string, number>();
  if (ingredientIds.length === 0 || unitIds.length === 0) return factors;

  const { data } = await supabase
    .from("ingredient_units")
    .select("ingredient_id, unit_id, to_base_factor")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("ingredient_id", ingredientIds)
    .in("unit_id", unitIds);

  for (const row of data ?? []) {
    const factor = Number(row.to_base_factor ?? 0);
    if (!(factor > 0)) continue;
    factors.set(`${row.ingredient_id}:${row.unit_id}`, factor);
  }
  return factors;
}

async function loadStockByLocation(
  supabase: AuthState["supabase"],
  tenantId: number,
  locationIds: number[],
  ingredientIds: number[],
): Promise<Record<number, Record<number, number>>> {
  const stockByLocation: Record<number, Record<number, number>> = {};
  if (locationIds.length === 0 || ingredientIds.length === 0) {
    return stockByLocation;
  }

  const { data } = await supabase
    .from("stock_levels")
    .select("location_id, ingredient_id, current_quantity")
    .eq("tenant_id", tenantId)
    .in("location_id", locationIds)
    .in("ingredient_id", ingredientIds);

  for (const row of data ?? []) {
    const locationStock = stockByLocation[row.location_id] ?? {};
    locationStock[row.ingredient_id] = Number(row.current_quantity ?? 0);
    stockByLocation[row.location_id] = locationStock;
  }
  return stockByLocation;
}

export async function loadStockRequestFulfillmentDetail({
  supabase,
  claims,
  requestId,
}: Pick<AuthState, "supabase" | "claims"> & {
  requestId: number;
}): Promise<StockRequestFulfillmentDetailData | null> {
  const data = await loadStockRequestDetail({
    supabase,
    tenantId: claims.tenant_id,
    requestId,
  });
  if (!data) return null;

  const actorKind: FulfillSiteKind | null =
    claims.user_role === "central_kitchen_lead"
      ? "central_kitchen"
      : claims.user_role === "central_supply_ops"
        ? "central_supply"
        : null;
  const canSeeAllSources =
    actorKind == null || data.branchId === claims.branch_id;
  const visibleItems = canSeeAllSources
    ? data.items
    : data.items.filter((item) => item.fulfillSiteKind === actorKind);
  const visibleTransferIds = new Set(
    visibleItems.flatMap((item) =>
      item.transferId == null ? [] : [item.transferId],
    ),
  );
  const visibleTransfers = canSeeAllSources
    ? data.transfers
    : data.transfers.filter(
        (transfer) =>
          visibleTransferIds.has(transfer.id) ||
          (!data.items.some((item) => item.transferId === transfer.id) &&
            transfer.fromBranchKind === actorKind),
      );
  const visibleData: StockRequestDetailData = canSeeAllSources
    ? data
    : {
        ...data,
        items: visibleItems,
        transfers: visibleTransfers,
        journey: getStockJourney({
          requestStatus: data.status,
          items: visibleItems,
          transfers: visibleTransfers,
        }),
      };
  const siteKinds = actorKind
    ? [actorKind]
    : (["central_supply", "central_kitchen"] as const);

  const toBaseFactors = await loadToBaseFactors(
    supabase,
    claims.tenant_id,
    visibleData.items.map((item) => ({
      ingredientId: item.ingredientId,
      entryUnitId: item.entryUnitId,
    })),
  );

  const groupDrafts = await Promise.all(
    siteKinds.map(async (siteKind) => {
      const sourceBranchId = await loadSourceBranchId(
        supabase,
        claims.tenant_id,
        siteKind,
        claims.branch_id,
        claims.user_role === "owner",
      );
      const siteItems = visibleData.items.filter(
        (item) => item.fulfillSiteKind === siteKind,
      );
      if (sourceBranchId == null || siteItems.length === 0) return null;
      const locations = await loadLocations(
        supabase,
        claims.tenant_id,
        sourceBranchId,
      );
      const lines: StockRequestFulfillLine[] = siteItems.map((item) => ({
        id: item.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unitLabel: item.unitLabel,
        toBaseFactor:
          toBaseFactors.get(`${item.ingredientId}:${item.entryUnitId}`) ?? 0,
        fulfillSiteKind: item.fulfillSiteKind,
        status: item.status,
      }));
      return {
        fulfillSiteKind: siteKind,
        fromBranchId: sourceBranchId,
        locations,
        lines,
      };
    }),
  );

  const locationIds = [
    ...new Set(
      groupDrafts.flatMap((group) =>
        group == null ? [] : group.locations.map((location) => location.id),
      ),
    ),
  ];
  const ingredientIds = [
    ...new Set(
      groupDrafts.flatMap((group) =>
        group == null ? [] : group.lines.map((line) => line.ingredientId),
      ),
    ),
  ];
  const stockByLocationAll = await loadStockByLocation(
    supabase,
    claims.tenant_id,
    locationIds,
    ingredientIds,
  );

  const groups: StockRequestFulfillGroup[] = [];
  for (const draft of groupDrafts) {
    if (draft == null) continue;
    const locationIdSet = new Set(draft.locations.map((location) => location.id));
    const stockByLocation: Record<number, Record<number, number>> = {};
    for (const locationId of locationIdSet) {
      stockByLocation[locationId] = stockByLocationAll[locationId] ?? {};
    }
    groups.push({ ...draft, stockByLocation });
  }

  return { data: visibleData, groups, canClose: claims.user_role === "owner" };
}
