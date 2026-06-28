"use client";

import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  AppShell,
  type BrandConfig,
  type PageHeaderConfig,
} from "@/components/app-shell";
import type { BranchSwitcherOption } from "@/_lib/branch-scope";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { resolveOfficePrimaryTabs } from "@/lib/office-nav";

// Shared brand + pageHeader assembly for the Management chrome family (D045 —
// one sidebar, one header). Both Management shells (OfficeModuleShell and
// BranchManagementShell) own different brand descriptors and different tier2
// sources, but the wiring around them is identical: resolve the cross-module
// primary tabs from role/branch, then hand brand + tier1/tier2 + pageHeader to
// the single AppShell. That assembly lives here once so the two shells stay
// thin callers (D048 — dedup chrome, do NOT merge the shells).

export interface ManagementShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  branchOptions?: BranchSwitcherOption[];
  brand: BrandConfig;
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
  branchOptions,
  brand,
  tier2,
  defaultPageTitle,
  pageHeader,
}: ManagementShellProps) {
  return (
    <AppShell
      user={user}
      role={role}
      branchId={branchId}
      branchOptions={branchOptions}
      brand={brand}
      tier1={resolveOfficePrimaryTabs(role, branchId)}
      tier2={tier2}
      defaultPageTitle={defaultPageTitle}
      pageHeader={pageHeader}
    >
      {children}
    </AppShell>
  );
}
