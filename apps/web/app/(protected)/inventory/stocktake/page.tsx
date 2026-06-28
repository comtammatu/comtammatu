import { loadAuthState } from "@/_lib/auth";
import { fetchStocktakeSessions } from "../actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import type {
  BranchOption,
  StocktakeSessionRow,
} from "./stocktake-list-client";
import { StocktakeListClient } from "./stocktake-list-client";
import { getBranchSiteDisplayName } from "../_lib/branch-site-labels";

export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();

  // Sidebar-selected branch drives action context (session branch default +
  // role-gated filters). Collapses to claims.branch_id for branch-scoped roles.
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchFilter = scope?.selectedBranchId ?? undefined;

  const sessionsRes = await fetchStocktakeSessions(branchFilter);

  const sessions: StocktakeSessionRow[] = sessionsRes.success
    ? ((sessionsRes.data ?? []) as StocktakeSessionRow[])
    : [];
  const branches: BranchOption[] = (scope?.allowedBranches ?? []).map((b) => ({
    id: b.id,
    name: getBranchSiteDisplayName(b),
    is_active: true,
  }));

  return (
    <StocktakeListClient
      initial={sessions}
      branches={branches}
      userRole={claims.user_role}
      userBranchId={scope?.selectedBranchId ?? null}
      routeBase="/inventory/stocktake"
    />
  );
}
