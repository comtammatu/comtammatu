import type { ReactNode } from "react";
import { canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { OwnerModuleShell } from "@/components/owner-module-shell";

export default async function FeedbackLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "feedback")) {
    redirect("/access-denied?reason=module");
  }

  return (
    <OwnerModuleShell
      module="feedback"
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
    </OwnerModuleShell>
  );
}
