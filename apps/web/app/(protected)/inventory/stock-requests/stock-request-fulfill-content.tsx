import { notFound, redirect } from "next/navigation";
import { STOCK_REQUEST_FULFILL_ROLES } from "@comtammatu/shared/auth";
import { formatInventoryLocationLabelVi } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import {
  isStockBearingLocationKind,
} from "@/(protected)/inventory/_lib/stock-bearing-locations";
import {
  StockRequestFulfillClient,
  type StockRequestFulfillGroup,
  type StockRequestFulfillLine,
} from "./[id]/stock-request-fulfill-client";

type FulfillSiteKind = "central_supply" | "central_kitchen";

type LocationRow = {
  id: number;
  location_kind: string | null;
  branches:
    | { branch_kind?: string | null; name?: string | null }
    | Array<{ branch_kind?: string | null; name?: string | null }>
    | null;
};

function branchFromLocation(row: LocationRow) {
  return Array.isArray(row.branches) ? row.branches[0] : row.branches;
}

async function loadFromBranchId(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
  tenantId: number,
  siteKind: FulfillSiteKind,
  actorBranchId: number | null,
  isOwner: boolean,
): Promise<number | null> {
  if (!isOwner && actorBranchId != null) {
    return actorBranchId;
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_kind", siteKind)
    .eq("is_active", true)
    .order("id")
    .limit(1)
    .maybeSingle();

  return branch?.id ?? null;
}

async function loadStockBearingLocations(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
  tenantId: number,
  branchId: number,
): Promise<Array<{ id: number; label: string }>> {
  const { data, error } = await supabase
    .from("inventory_locations")
    .select(
      "id, location_kind, branches!inventory_locations_branch_id_fkey!inner ( branch_kind, name )",
    )
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("is_default_issue", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) return [];

  return ((data ?? []) as LocationRow[])
    .filter((row) =>
      isStockBearingLocationKind({
        siteKind: branchFromLocation(row)?.branch_kind,
        locationKind: row.location_kind,
      }),
    )
    .map((row) => {
      const branch = branchFromLocation(row);
      return {
        id: row.id,
        label: formatInventoryLocationLabelVi({
          branchName: branch?.name,
          siteKind: branch?.branch_kind,
          locationKind: row.location_kind,
        }),
      };
    });
}

export async function StockRequestFulfillPageContent({
  requestId,
}: {
  requestId: number;
}) {
  const { supabase, claims } = await loadAuthState();
  if (
    !STOCK_REQUEST_FULFILL_ROLES.includes(
      claims.user_role as (typeof STOCK_REQUEST_FULFILL_ROLES)[number],
    )
  ) {
    redirect("/inventory");
  }

  const actorFulfillKind: FulfillSiteKind | null =
    claims.user_role === "central_kitchen_lead"
      ? "central_kitchen"
      : claims.user_role === "central_supply_ops"
        ? "central_supply"
        : null;
  const isOwner = claims.user_role === "owner";

  const { data: header } = await supabase
    .from("stock_requests")
    .select("id, request_number, status, branch_id, branches(name)")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", requestId)
    .maybeSingle();

  if (!header) notFound();

  const req = header as {
    id: number;
    request_number: string;
    status: string;
    branch_id: number;
    branches: { name: string } | Array<{ name: string }> | null;
  };

  if (!["submitted", "partially_fulfilled"].includes(req.status)) {
    redirect("/inventory/stock-requests");
  }

  const branchRecord = Array.isArray(req.branches)
    ? req.branches[0]
    : req.branches;

  let itemsQuery = supabase
    .from("stock_request_items")
    .select(
      "id, quantity, fulfill_site_kind, status, ingredient_id, ingredients(name)",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("request_id", requestId)
    .order("id");

  if (actorFulfillKind) {
    itemsQuery = itemsQuery.eq("fulfill_site_kind", actorFulfillKind);
  }

  const { data: items } = await itemsQuery;

  const lines = (items ?? []) as Array<{
    id: number;
    quantity: number;
    fulfill_site_kind: FulfillSiteKind;
    status: string;
    ingredients: { name: string } | null;
  }>;

  const siteKinds = actorFulfillKind
    ? [actorFulfillKind]
    : (["central_supply", "central_kitchen"] as const);

  const groups: StockRequestFulfillGroup[] = [];

  for (const siteKind of siteKinds) {
    const groupLines: StockRequestFulfillLine[] = lines
      .filter((line) => line.fulfill_site_kind === siteKind)
      .map((line) => ({
        id: line.id,
        ingredientName: line.ingredients?.name ?? `NL #${line.id}`,
        quantity: line.quantity,
        fulfillSiteKind: line.fulfill_site_kind,
        status: line.status,
      }));

    if (groupLines.length === 0) continue;

    const fromBranchId = await loadFromBranchId(
      supabase,
      claims.tenant_id,
      siteKind,
      claims.branch_id,
      isOwner,
    );

    if (fromBranchId == null) continue;

    const locations = await loadStockBearingLocations(
      supabase,
      claims.tenant_id,
      fromBranchId,
    );

    groups.push({
      fulfillSiteKind: siteKind,
      fromBranchId,
      locations,
      lines: groupLines,
    });
  }

  return (
    <StockRequestFulfillClient
      requestId={req.id}
      requestNumber={req.request_number}
      status={req.status}
      branchLabel={branchRecord?.name ?? `CN #${req.branch_id}`}
      groups={groups}
      presentation="dialog"
    />
  );
}
