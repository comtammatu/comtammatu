import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../_lib/feature-flags";
import { listStocktakeConflicts } from "../../stocktake-actions";
import { parseBranchIdParam } from "../../_lib/inventory-scope";
import { ConflictsQueueClient } from "./conflicts-queue-client";

export const dynamic = "force-dynamic";

export default async function StocktakeConflictsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[]; resolved?: string }>;
}) {
  const params = await searchParams;
  const requested = parseBranchIdParam(params.branchId);
  const includeResolved = params.resolved === "1";

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login?next=/inventory/stocktake/conflicts");

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) notFound();

  const branchId = requested ?? claims.branch_id ?? null;
  if (branchId === null) {
    redirect("/inventory/stocktake?error=branch_required");
  }

  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    branchId,
    INVENTORY_FEATURE_FLAGS.S13B_STOCKTAKE_RECOUNT,
  );
  if (!flagEnabled) {
    redirect(`/inventory/stocktake?branchId=${branchId}&error=stocktake_recount_not_enabled`);
  }

  const conflictsRes = await listStocktakeConflicts(branchId, {
    includeResolved,
    limit: 200,
  });

  return (
    <ConflictsQueueClient
      branchId={branchId}
      includeResolved={includeResolved}
      initial={conflictsRes.success ? (conflictsRes.data ?? []) : []}
    />
  );
}
