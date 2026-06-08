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
      INVENTORY_FEATURE_FLAGS.INVENTORY_STOCKTAKE_REDESIGNED,
    );
    if (!flagEnabled) {
      redirect(
        `/inventory/stocktake?branchId=${gateBranchId}&error=stocktake_redesigned_not_enabled`,
      );
    }
  }

  const branches = scope.allowedBranches.map((b) => ({
    id: b.id,
    name: getBranchSiteDisplayName(b),
  }));

  // HKD lean baseline: stocktake is branch-scoped — no per-location splitting.
  const locations: Array<{
    id: number;
    name: string;
    branchId: number;
    kind: string | null;
  }> = [];

  return (
    <NewStocktakeSessionClient
      branches={branches}
      locations={locations}
      defaultBranchId={scope.selectedBranchId ?? branches[0]?.id ?? null}
    />
  );
}
