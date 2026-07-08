"use client";


import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import { resolveOfficePrimaryTabs } from "@/lib/office-nav";
import { resolveFinanceNav } from "./finance-nav";
import { useFinanceRealtimeRefresh } from "../use-finance-realtime-refresh";

const financeCopy = messages.finance;

export interface FinanceShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  showInvoices: boolean;
  showSummary: boolean;
  showSupplierPayables: boolean;
}

export function FinanceShell({
  children,
  user,
  role,
  branchId: homeBranchId,
  showInvoices,
  showSummary,
  showSupplierPayables,
}: FinanceShellProps) {
  // Lift the realtime subscription up to the shell so every Finance
  // route shares one Supabase channel (Architect §3 risk #3 + Critic R5).
  // Reading branch from URL keeps the shell agnostic of which route is
  // mounted; clients no longer need to mount this hook themselves.
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch");
  const parsedBranch =
    branchParam && branchParam !== "all" ? Number(branchParam) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0 ? parsedBranch : null;
  useFinanceRealtimeRefresh({ branchId });

  return (
    <AppShell
      user={user}
      tier1={resolveOfficePrimaryTabs(role, homeBranchId)}
      tier2={resolveFinanceNav({
        showInvoices,
        showSummary,
        showSupplierPayables,
      })}
      defaultPageTitle={financeCopy.shell.defaultPageTitle}
      pageHeader={{}}
    >
      {children}
    </AppShell>
  );
}
