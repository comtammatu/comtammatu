import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { OfficeModuleShell } from "@/components/office-module-shell";

export default async function HRLayout({ children }: { children: ReactNode }) {
  const { supabase, session, claims } = await loadAuthState();
  const branchOptions = await resolveBranchSwitcherOptions(supabase, claims);

  return (
    <OfficeModuleShell
      module="hr"
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
