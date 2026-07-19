"use client";

import type { ReactNode } from "react";
import { type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import type { OwnerModuleId } from "@/lib/owner-module-contract";
import {
  resolveOwnerDeepNav,
  resolveOwnerPrimaryTabs,
} from "@/lib/owner-nav";

// Generic Owner shell for modules whose chrome is only shared primary tabs
// plus module deep nav, keyed by a serializable `module` id across the RSC
// boundary.
// Modules that own shell-scoped client state keep their own wrapper.

export function OwnerModuleShell({
  module,
  user,
  role,
  branchId,
  children,
}: {
  module: OwnerModuleId;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  children: ReactNode;
}) {
  const tier2 = resolveOwnerDeepNav(role, module, branchId);

  return (
    <AppShell
      user={user}
      role={role}
      tier1={resolveOwnerPrimaryTabs(role, branchId)}
      tier2={tier2}
    >
      {children}
    </AppShell>
  );
}
