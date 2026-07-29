import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { ControlSurfaceShell } from "@/components/control-surface-shell";

export default async function BranchesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, claims } = await loadAuthState();

  if (!canAccess(claims.user_role, "branches")) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return (
    <ControlSurfaceShell
      module="branches"
      user={{
        name:
          user?.user_metadata?.["display_name"] ??
          user?.email ??
          "",
      }}
      role={claims.user_role}
      homeBranchId={claims.branch_id}
    >
      {children}
    </ControlSurfaceShell>
  );
}
