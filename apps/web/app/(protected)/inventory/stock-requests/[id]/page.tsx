import { notFound, redirect } from "next/navigation";
import { STOCK_REQUEST_FULFILL_ROLES } from "@comtammatu/shared/auth";
import { formatInventoryLocationLabelVi } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { StockRequestDetailView } from "@/components/stock-request-detail-view";
import { loadStockRequestDetail } from "@lib/inventory/stock-request-detail-data";
import { isStockBearingLocationKind } from "../../_lib/stock-bearing-locations";
import {
  StockRequestFulfillClient,
  type StockRequestFulfillGroup,
} from "./stock-request-fulfill-client";

type FulfillSiteKind = "central_supply" | "central_kitchen";

async function loadSourceBranchId(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
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
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
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

export default async function InventoryStockRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const requestId = Number(rawId);
  if (!Number.isInteger(requestId) || requestId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();
  if (
    !STOCK_REQUEST_FULFILL_ROLES.includes(
      claims.user_role as (typeof STOCK_REQUEST_FULFILL_ROLES)[number],
    )
  ) {
    redirect("/inventory");
  }

  const actorKind: FulfillSiteKind | null =
    claims.user_role === "central_kitchen_lead"
      ? "central_kitchen"
      : claims.user_role === "central_supply_ops"
        ? "central_supply"
        : null;
  const data = await loadStockRequestDetail({
    supabase,
    tenantId: claims.tenant_id,
    requestId,
  });
  if (!data) notFound();

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
    const lines = data.items
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

  return (
    <StockRequestDetailView
      data={data}
      mode="central"
      actions={
        <StockRequestFulfillClient
          requestId={data.id}
          requestNumber={data.requestNumber}
          status={data.status}
          branchLabel={data.branchName}
          groups={groups}
          embedded
          canClose={claims.user_role === "owner"}
        />
      }
    />
  );
}
