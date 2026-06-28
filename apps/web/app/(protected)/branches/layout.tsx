import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { OfficeModuleShell } from "@/components/office-module-shell";

export default async function BranchesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, session, claims } = await loadAuthState();

  if (!canAccess(claims.user_role, "branches")) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const branchOptions = await resolveBranchSwitcherOptions(supabase, claims);

  return (
    <OfficeModuleShell
      module="branches"
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      branchId={claims.branch_id}
      branchOptions={branchOptions}
    >
      {children}
    </OfficeModuleShell>
  );
}
