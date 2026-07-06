"use client";

import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { AppShell, type PageHeaderConfig } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { resolveOfficePrimaryTabs } from "@/lib/office-nav";

// Shared pageHeader assembly for the office Management chrome (D045 — one
// sidebar, one header). OfficeModuleShell owns the module page descriptor and
// tier2 source, then hands tier1/tier2 + pageHeader to AppShell.

export interface ManagementShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  /** Sub-tabs for the active primary tab (module/branch deep nav). */
  tier2: ShellNavGroup[];
  defaultPageTitle: string;
  pageHeader: PageHeaderConfig;
}

export function ManagementShell({
  children,
  user,
  role,
  branchId,
  tier2,
  defaultPageTitle,
  pageHeader,
}: ManagementShellProps) {
  return (
    <AppShell
      user={user}
      tier1={resolveOfficePrimaryTabs(role, branchId)}
      tier2={tier2}
      defaultPageTitle={defaultPageTitle}
      pageHeader={pageHeader}
    >
      {children}
    </AppShell>
  );
}
