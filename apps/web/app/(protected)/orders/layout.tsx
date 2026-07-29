import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { ControlSurfaceShell } from "@/components/control-surface-shell";

export default async function OrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, claims } = await loadAuthState();

  return (
    <ControlSurfaceShell
      module="orders"
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
