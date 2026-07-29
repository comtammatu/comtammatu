import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { ControlSurfaceShell } from "@/components/control-surface-shell";

export default async function HRLayout({ children }: { children: ReactNode }) {
  const { session, claims } = await loadAuthState();

  return (
    <ControlSurfaceShell
      module="hr"
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      homeBranchId={claims.branch_id}
    >
      {children}
    </ControlSurfaceShell>
  );
}
