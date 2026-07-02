import { notFound, redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../_lib/feature-flags";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../../_lib/inventory-scope";
import { getBranchSiteDisplayName } from "../../_lib/branch-site-labels";
import { NewStocktakeSessionClient } from "./new-session-client";

export const dynamic = "force-dynamic";

interface NewStocktakeSessionPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  routeBase?: string;
  embedded?: boolean;
}

export async function NewStocktakeSessionPageContent({
  searchParams,
  routeBranchId,
  routeBase = "/inventory/stocktake",
  embedded = false,
}: NewStocktakeSessionPageContentProps) {
  const sp = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();

  // Sidebar-selected branch drives the feature-flag gate and default session
  // branch. For tenant-wide roles (owner) this is the sidebar picker; for
  // branch-scoped roles it collapses to claims.branch_id.
  const requested =
    routeBranchId ?? (await resolveRequestedBranchId(sp.branchId));
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  if (routeBranchId != null && scope.selectedBranchId !== routeBranchId) {
    notFound();
  }

  // Feature flag gate — S13a new stocktake UI must be enabled per-branch.
  const gateBranchId = scope.selectedBranchId;
  if (gateBranchId !== null) {
    const flagEnabled = await isFeatureEnabledForBranch(
      supabase,
      gateBranchId,
      INVENTORY_FEATURE_FLAGS.INVENTORY_STOCKTAKE_REDESIGNED,
    );
    if (!flagEnabled) {
      redirect(
        `${routeBase}?branchId=${gateBranchId}&error=stocktake_redesigned_not_enabled`,
      );
    }
  }

  const locationsRes = await supabase
    .from("inventory_locations")
    .select("id, name, branch_id, location_kind, is_active")
    .eq("is_active", true)
    .order("name");

  const allowedBranchIds = new Set(scope.allowedBranches.map((b) => b.id));
  const branches = scope.allowedBranches.map((b) => ({
    id: b.id,
    name: getBranchSiteDisplayName(b),
  }));

  const locations =
    (locationsRes.data ?? [])
      .filter((l) => allowedBranchIds.has(l.branch_id as number))
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
      embedded={embedded}
    />
  );
}

export default async function NewStocktakeSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <NewStocktakeSessionPageContent searchParams={searchParams} />;
}
