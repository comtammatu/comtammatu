"use client";

import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  SidebarInset,
  SidebarProvider,
} from "@comtammatu/ui/components/sidebar";
import { InventorySidebar } from "./inventory-sidebar";
import { InventoryHeader } from "./inventory-header";

interface InventoryShellProps {
  children: ReactNode;
  userRole: StaffRole;
  siteName: string;
  siteKind: string;
}

export function InventoryShell({
  children,
  userRole,
  siteName,
  siteKind,
}: InventoryShellProps) {
  return (
    <SidebarProvider>
      <InventorySidebar userRole={userRole} />
      <SidebarInset>
        <InventoryHeader
          siteName={siteName}
          siteKind={siteKind}
          userRole={userRole}
        />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-screen-2xl space-y-6">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
