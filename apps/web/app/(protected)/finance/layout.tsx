import type { ReactNode } from "react";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { ControlSurfaceShell } from "@/components/control-surface-shell";

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
    <ControlSurfaceShell
      module="finance"
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      homeBranchId={claims.branch_id}
      finance={{
        showInvoices,
        showSupplierPayables,
        showRevenueTargets: claims.user_role === "owner",
      }}
    >
      {children}
    </ControlSurfaceShell>
  );
}
