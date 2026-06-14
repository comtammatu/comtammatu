"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wallet as IconWallet } from "lucide-react";
import type { ReactNode } from "react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import { resolveOfficeNavGroups } from "@/lib/office-nav";
import { resolveFinanceNav } from "./finance-nav";
import { useFinanceRealtimeRefresh } from "../use-finance-realtime-refresh";

const financeCopy = messages.finance;

export interface FinanceShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
}

export function FinanceShell({
  children,
  user,
  role,
  branchId: homeBranchId,
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
  const homeLink = resolveRoleHomeLink(role, homeBranchId);

  return (
    <AppShell
      user={user}
      role={role}
      branchId={homeBranchId}
      brand={{
        icon: IconWallet,
        subLabel: financeCopy.shell.subLabel,
        mainLabel: financeCopy.shell.mainLabel,
      }}
      navGroups={[...resolveOfficeNavGroups(role), ...resolveFinanceNav()]}
      defaultPageTitle={financeCopy.shell.defaultPageTitle}
      pageHeader={{
        crumbLabel: financeCopy.shell.crumbLabel,
        description: financeCopy.shell.description,
        actions: (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={homeLink.href}>{homeLink.label}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/finance/revenue">
                {financeCopy.basic.actions.revenue}
              </Link>
            </Button>
          </>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
