"use client";

import { Building2 as IconBuilding2 } from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { AppShell } from "@/components/app-shell";
import { resolveBranchDeepNav, resolveOfficePrimaryTabs } from "@/lib/office-nav";

type BreadcrumbSegment = string | { label: string; href?: string };

interface BranchManagementShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId: number;
  branchName: string;
  defaultPageTitle?: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbSegments?: BreadcrumbSegment[];
}

export function BranchManagementShell({
  children,
  user,
  role,
  branchId,
  branchName,
  defaultPageTitle = APP_COPY_VI.branchCommand,
  description,
  actions,
  breadcrumbSegments,
}: BranchManagementShellProps) {
  return (
    <AppShell
      user={user}
      role={role}
      branchId={branchId}
      brand={{
        icon: IconBuilding2,
        subLabel: BRANCH_VI.long,
        mainLabel: branchName,
        logoVariant: null,
      }}
      tier1={resolveOfficePrimaryTabs(role, branchId)}
      tier2={resolveBranchDeepNav(role, branchId)}
      defaultPageTitle={defaultPageTitle}
      pageHeader={{
        breadcrumbSegments,
        description,
        actions,
      }}
    >
      {children}
    </AppShell>
  );
}
