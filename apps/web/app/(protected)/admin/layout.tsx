import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { AdminShell } from "./components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();

  return (
    <AdminShell
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
    </AdminShell>
  );
}
