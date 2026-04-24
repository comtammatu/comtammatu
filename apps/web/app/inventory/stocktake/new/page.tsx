import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../_lib/feature-flags";
import { getBranchSiteDisplayName } from "../../_lib/branch-site-labels";
import { NewStocktakeSessionClient } from "./new-session-client";

export const dynamic = "force-dynamic";

export default async function NewStocktakeSessionPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login?next=/inventory/stocktake/new");

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) notFound();

  // Feature flag gate — S13a new stocktake UI must be enabled per-branch.
  const gateBranchId = claims.branch_id;
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

  const [branchesRes, locationsRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active, branch_kind")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("inventory_locations")
      .select("id, name, branch_id, location_kind, is_active")
      .eq("is_active", true)
      .order("name"),
  ]);

  const branches =
    (branchesRes.data ?? []).map((b) => ({
      id: b.id as number,
      name: getBranchSiteDisplayName(b),
    })) ?? [];

  const locations =
    (locationsRes.data ?? []).map((l) => ({
      id: l.id as number,
      name: l.name as string,
      branchId: l.branch_id as number,
      kind: (l.location_kind ?? null) as string | null,
    })) ?? [];

  return (
    <NewStocktakeSessionClient
      branches={branches}
      locations={locations}
      defaultBranchId={claims.branch_id ?? branches[0]?.id ?? null}
    />
  );
}
