import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchStocktakeSessions } from "../actions";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import type {
  BranchOption,
  StocktakeSessionRow,
} from "./stocktake-list-client";
import { StocktakeListClient } from "./stocktake-list-client";
import { getBranchSiteDisplayName } from "../_lib/branch-site-labels";

interface StocktakePageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  routeBase?: string;
  embedded?: boolean;
}

export async function StocktakePageContent({
  searchParams,
  routeBranchId,
  routeBase = "/inventory/stocktake",
  embedded = false,
}: StocktakePageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();

  // Sidebar-selected branch drives action context (session branch default +
  // role-gated filters). Collapses to claims.branch_id for branch-scoped roles.
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const branchFilter = scope.selectedBranchId ?? undefined;

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
      routeBase={routeBase}
      embedded={embedded}
    />
  );
}

export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <StocktakePageContent searchParams={searchParams} />;
}
