import type { ReactNode } from "react";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { FinanceShell } from "./components/finance-shell";

export default async function FinanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();
  const [showInvoices, showSupplierPayables] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
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
      showInvoices={showInvoices}
      showSupplierPayables={showSupplierPayables}
    >
      {children}
    </FinanceShell>
  );
}
