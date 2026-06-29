import { notFound } from "next/navigation";
import { Building2 as IconBuilding2 } from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
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

  return (
    <AppPage mobile density="compact" contentClassName="max-w-lg">
      <AppPageHeader title={MODULE_ACL.branches.label} />
      {allowedBranches.length > 0 ? (
        <LinkCardGrid>
          {allowedBranches.map((branch) => (
            <AppLinkCard
              key={branch.id}
              href={`/br/${branch.id}`}
              title={branch.name}
              icon={<IconBuilding2 />}
            />
          ))}
        </LinkCardGrid>
      ) : (
        <AppEmptyState title={MODULE_ACL.branches.label} />
      )}
    </AppPage>
  );
}
