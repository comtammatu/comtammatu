import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { OfficeModuleShell } from "@/components/office-module-shell";

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
    <OfficeModuleShell
      module="branches"
      user={{
        name:
          user.displayName ?? user.email ?? "",
      }}
      role={claims.user_role}
      branchId={claims.branch_id}
    >
      {children}
    </OfficeModuleShell>
  );
}
