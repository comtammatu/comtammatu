import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { OfficeModuleShell } from "@/components/office-module-shell";

export default async function HRLayout({ children }: { children: ReactNode }) {
  const { session, claims } = await loadAuthState();

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
    >
      {children}
    </OfficeModuleShell>
  );
}
