import type { ReactNode } from "react";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { FinanceShell } from "./components/finance-shell";

export default async function FinanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, session, claims } = await loadAuthState();
  const [showInvoices, showSummary, branchOptions] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW),
    currentUserHasPermissionAny(PERMISSION_KEYS.SETTINGS_TENANT),
    resolveBranchSwitcherOptions(supabase, claims),
  ]);

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
      branchOptions={branchOptions}
      showInvoices={showInvoices}
      showSummary={showSummary}
    >
      {children}
    </FinanceShell>
  );
}
