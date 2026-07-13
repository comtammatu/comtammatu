import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { AdminDashboardModuleShell } from "@/components/admin-dashboard-module-shell";

export default async function MenuLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, claims } = await loadAuthState();

  return (
    <AdminDashboardModuleShell
      module="menu"
      user={{
        name:
          user.displayName ?? user.email ?? "",
      }}
      role={claims.user_role}
      branchId={claims.branch_id}
    >
      {children}
    </AdminDashboardModuleShell>
  );
}
