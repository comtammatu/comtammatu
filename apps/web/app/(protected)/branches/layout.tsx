import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { AdminDashboardModuleShell } from "@/components/admin-dashboard-module-shell";

export default async function BranchesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();

  if (!canAccess(claims.user_role, "branches")) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return (
    <AdminDashboardModuleShell
      module="branches"
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
    </AdminDashboardModuleShell>
  );
}
