import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "../../_lib/inventory-scope";
import { getBranchSiteDisplayName } from "../../_lib/branch-site-labels";
import { NewStocktakeSessionClient } from "./new-session-client";
import { messages } from "@lib/messages";

interface NewStocktakeSessionPageContentProps {
  searchParams?: Promise<{ branch?: string | string[] }>;
  routeBranchId?: number;
  routeBase?: string;
}

export async function NewStocktakeSessionPageContent({
  searchParams,
  routeBranchId,
  routeBase = "/inventory/stocktake",
}: NewStocktakeSessionPageContentProps) {
  const sp = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();

  // Sidebar-selected branch drives the default session branch. For tenant-wide
  // roles (owner) this is the sidebar picker; for branch-scoped roles it
  // collapses to claims.branch_id.
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch: sp.branch,
  });
  if (scope.outOfScope) notFound();

  const locationsRes = await supabase
    .from("inventory_locations")
    .select("id, name, branch_id, location_kind, is_active")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const allowedBranchIds = new Set(scope.allowedBranches.map((b) => b.id));
  const branches = scope.allowedBranches.map((b) => ({
    id: b.id,
    name: getBranchSiteDisplayName(b),
  }));

  const locations =
    (locationsRes.data ?? [])
      .filter(
        (location) =>
          allowedBranchIds.has(location.branch_id as number) &&
          (location.location_kind === "warehouse" ||
            location.location_kind === "kitchen"),
      )
      .map((l) => ({
        id: l.id as number,
        name: l.name as string,
        branchId: l.branch_id as number,
        kind: (l.location_kind ?? null) as string | null,
      })) ?? [];

  return (
    <NewStocktakeSessionClient
      branches={branches}
      locations={locations}
      defaultBranchId={scope.selectedBranchId ?? branches[0]?.id ?? null}
      routeBase={routeBase}
      loadFailed={locationsRes.error !== null}
      loadFailedTitle={messages.inventory.stocktake.startLoadFailed}
    />
  );
}

export default async function NewStocktakeSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  return <NewStocktakeSessionPageContent searchParams={searchParams} />;
}
