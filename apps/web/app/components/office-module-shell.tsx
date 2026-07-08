"use client";

import type { ReactNode } from "react";
import {
  type StaffRole,
} from "@comtammatu/shared/auth";
import { ManagementShell } from "@/components/management-chrome";
import {
  OFFICE_MODULE_CHROME,
  type OfficeModuleId,
} from "@/lib/office-module-contract";
import { resolveOfficeDeepNav } from "@/lib/office-nav";

// Generic Management shell for modules whose chrome is the shared primary tabs +
// the module's own deep nav, and whose chrome carries no shell-scoped client
// state. Chrome lives in this client registry keyed by a serializable `module`
// id, so layouts pass only the id across the RSC boundary.
// Modules that own shell-scoped client state keep their own wrapper.

export function OfficeModuleShell({
  module,
  user,
  role,
  branchId,
  children,
}: {
  module: OfficeModuleId;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  children: ReactNode;
}) {
  const chrome = OFFICE_MODULE_CHROME[module];
  const tier2 = resolveOfficeDeepNav(role, module, branchId);

  return (
    <ManagementShell
      user={user}
      role={role}
      branchId={branchId}
      tier2={tier2}
      defaultPageTitle={chrome.defaultPageTitle}
      pageHeader={{}}
    >
      {children}
    </ManagementShell>
  );
}
