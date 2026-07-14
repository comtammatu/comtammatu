"use client";

import type { ReactNode } from "react";
import { type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import type { AdminDashboardModuleId } from "@/lib/admin-dashboard-module-contract";
import {
  resolveAdminDashboardDeepNav,
  resolveAdminDashboardPrimaryTabs,
} from "@/lib/admin-dashboard-nav";

// Generic Admin Dashboard shell for modules whose chrome consists only of shared
// primary tabs plus module deep nav, keyed by a serializable `module` id across
// the RSC boundary.
// Modules that own shell-scoped client state keep their own wrapper.

export function AdminDashboardModuleShell({
  module,
  user,
  role,
  branchId,
  children,
}: {
  module: AdminDashboardModuleId;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  children: ReactNode;
}) {
  const tier2 = resolveAdminDashboardDeepNav(role, module, branchId);

  return (
    <AppShell
      user={user}
      role={role}
      tier1={resolveAdminDashboardPrimaryTabs(role, branchId)}
      tier2={tier2}
    >
      {children}
    </AppShell>
  );
}
