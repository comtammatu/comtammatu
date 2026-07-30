import "server-only";

import { formatInventoryLocationLabelVi } from "@comtammatu/shared/labels";
import type { loadAuthState } from "@/_lib/auth";
import { isStockBearingLocationKind } from "@/(protected)/inventory/_lib/stock-bearing-locations";
import {
  loadStockRequestDetail,
  type StockRequestDetailData,
} from "./stock-request-detail-data";
import { getStockJourney } from "./stock-journey-model";

type AuthState = Awaited<ReturnType<typeof loadAuthState>>;
type FulfillSiteKind = "central_supply" | "central_kitchen";

export type StockRequestFulfillGroup = {
  fulfillSiteKind: FulfillSiteKind;
  fromBranchId: number;
  locations: Array<{ id: number; label: string }>;
  lines: Array<{
    id: number;
    ingredientName: string;
    quantity: number;
    fulfillSiteKind: FulfillSiteKind;
    status: string;
  }>;
};

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
  const groups: StockRequestFulfillGroup[] = [];
  for (const siteKind of siteKinds) {
    const sourceBranchId = await loadSourceBranchId(
      supabase,
      claims.tenant_id,
      siteKind,
      claims.branch_id,
      claims.user_role === "owner",
    );
    const lines = visibleData.items
      .filter((item) => item.fulfillSiteKind === siteKind)
      .map((item) => ({
        id: item.id,
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        fulfillSiteKind: item.fulfillSiteKind,
        status: item.status,
      }));
    if (sourceBranchId == null || lines.length === 0) continue;
    groups.push({
      fulfillSiteKind: siteKind,
      fromBranchId: sourceBranchId,
      locations: await loadLocations(
        supabase,
        claims.tenant_id,
        sourceBranchId,
      ),
      lines,
    });
  }

  return { data: visibleData, groups, canClose: claims.user_role === "owner" };
}
