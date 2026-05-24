import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
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

export default async function NewStocktakeSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    const params = new URLSearchParams();
    const branchIdParam = Array.isArray(sp.branchId)
      ? sp.branchId[0]
      : sp.branchId;
    if (branchIdParam) params.set("branchId", branchIdParam);
    const query = params.toString();
    const returnTo = `/inventory/stocktake/new${query ? `?${query}` : ""}`;
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) notFound();

  // Sidebar-selected branch drives the feature-flag gate and default session
  // branch. For tenant-wide roles (owner/super_manager/area_manager) this is
  // the sidebar picker; for branch-scoped roles it collapses to claims.branch_id.
  const requested = await resolveRequestedBranchId(sp.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);

  // Feature flag gate — S13a new stocktake UI must be enabled per-branch.
  const gateBranchId = scope.selectedBranchId;
  if (gateBranchId !== null) {
    const flagEnabled = await isFeatureEnabledForBranch(
      supabase,
      gateBranchId,
      INVENTORY_FEATURE_FLAGS.S13A_STOCKTAKE_V2,
    );
    if (!flagEnabled) {
      redirect(`/inventory/stocktake?branchId=${gateBranchId}&error=stocktake_v2_not_enabled`);
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
    />
  );
}
