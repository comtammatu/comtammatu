import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import {
  Building2 as IconBuilding2,
  LayoutDashboard as IconLayoutDashboard,
} from "lucide-react";
import {
  canAccess,
  MODULE_ACL,
  OPERATOR_TILE_GROUP_TITLES,
} from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  LinkCardGrid,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { selectOperatorBranchScope, type OperatorBranchOption } from "@/_lib/branch-context";

/**
 * Branch identity (name/active flag) rarely changes but this list re-runs
 * on every visit to the branch picker — the door every operator role hits
 * after login and whenever they navigate back from a branch. Tag
 * `"branches-list"` busts via the same tag `branches/actions.ts` mutations
 * already call. 5-minute TTL is a safety net for any mutation path that
 * forgets to call the tag.
 *
 * Service-role client bypasses RLS but the explicit `tenant_id` filter
 * preserves tenant isolation; the outer page already resolved claims via
 * `loadAuthState()` before calling this.
 */
const getCachedOperatorBranches = unstable_cache(
  async (tenantId: number): Promise<OperatorBranchOption[]> => {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("branch_kind", "branch")
      .order("id");

    if (error) throw new Error(`fetchOperatorBranches: ${error.message}`);
    return (data ?? []) as OperatorBranchOption[];
  },
  ["operator-branches"],
  {
    revalidate: 300,
    tags: ["branches-list"],
  },
);

export default async function BranchPickerPage() {
  const { claims } = await loadAuthState();

  let data: OperatorBranchOption[];
  try {
    data = await getCachedOperatorBranches(claims.tenant_id);
  } catch {
    notFound();
  }

  const { allowedBranches } = selectOperatorBranchScope(claims, data, null);
  const showOfficeCard = canAccess(claims.user_role, "dashboard");

  return (
    <AppPage mobile density="compact" contentClassName="max-w-lg">
      <AppPageHeader title={MODULE_ACL.branches.label} />
      {allowedBranches.length > 0 || showOfficeCard ? (
        <LinkCardGrid>
          {allowedBranches.map((branch) => (
            <AppLinkCard
              key={branch.id}
              href={`/br/${branch.id}`}
              title={branch.name}
              icon={<IconBuilding2 />}
            />
          ))}
          {showOfficeCard ? (
            <AppLinkCard
              href={MODULE_ACL.dashboard.path}
              title={OPERATOR_TILE_GROUP_TITLES.office_bridge}
              icon={<IconLayoutDashboard />}
              tone="secondary"
            />
          ) : null}
        </LinkCardGrid>
      ) : (
        <AppEmptyState title={MODULE_ACL.branches.label} />
      )}
    </AppPage>
  );
}
