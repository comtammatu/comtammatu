import { notFound } from "next/navigation";
import {
  Building2 as IconBuilding2,
  LayoutDashboard as IconLayoutDashboard,
} from "lucide-react";
import {
  canAccess,
  MODULE_ACL,
  OPERATOR_TILE_GROUP_TITLES,
} from "@comtammatu/shared/auth";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  LinkCardGrid,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { selectOperatorBranchScope, type OperatorBranchOption } from "@/_lib/branch-context";

export default async function BranchPickerPage() {
  const { supabase, claims } = await loadAuthState();

  const { data, error } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("branch_kind", "branch")
    .order("id");

  if (error) notFound();

  const { allowedBranches } = selectOperatorBranchScope(
    claims,
    (data ?? []) as OperatorBranchOption[],
    null,
  );
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
