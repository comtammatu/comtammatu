import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { FinanceShell } from "./components/finance-shell";

export default async function FinanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();

  return (
    <FinanceShell
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
    </FinanceShell>
  );
}
