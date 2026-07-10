"use client";

import type { ReactNode } from "react";
import {
  type StaffRole,
} from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import type { OfficeModuleId } from "@/lib/office-module-contract";
import { resolveOfficeDeepNav, resolveOfficePrimaryTabs } from "@/lib/office-nav";

// Generic Management shell for modules whose chrome is only shared primary tabs
// plus module deep nav, keyed by a serializable `module` id across the RSC
// boundary.
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
  const tier2 = resolveOfficeDeepNav(role, module, branchId);

  return (
    <AppShell
      user={user}
      role={role}
      tier1={resolveOfficePrimaryTabs(role, branchId)}
      tier2={tier2}
    >
      {children}
    </AppShell>
  );
}
