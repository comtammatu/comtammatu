"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart3 as IconBarChart3,
  Boxes as IconBoxes,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { useFinanceRealtimeRefresh } from "../use-finance-realtime-refresh";

const financeCopy = messages.finance;

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: financeCopy.nav.groups.basic,
    items: [
      {
        href: "/finance",
        label: financeCopy.nav.items.todayMoney,
        icon: IconWallet,
      },
      {
        href: "/finance/revenue",
        label: financeCopy.nav.items.revenue,
        icon: IconBarChart3,
      },
      {
        href: "/admin/reports/inventory-value",
        label: financeCopy.nav.items.inventoryValue,
        icon: IconBoxes,
      },
      {
        href: "/finance/food-cost",
        label: financeCopy.nav.items.grossProfit,
        icon: IconTrendingUp,
      },
    ],
  },
];

export interface FinanceShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function FinanceShell({ children, user, role }: FinanceShellProps) {
  // Lift the realtime subscription up to the shell so every Finance
  // route shares one Supabase channel (Architect §3 risk #3 + Critic R5).
  // Reading branch from URL keeps the shell agnostic of which route is
  // mounted; clients no longer need to mount this hook themselves.
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch");
  const parsedBranch = branchParam && branchParam !== "all"
    ? Number(branchParam)
    : NaN;
  const branchId = Number.isFinite(parsedBranch) && parsedBranch > 0
    ? parsedBranch
    : null;
  useFinanceRealtimeRefresh({ branchId });

  return (
    <AppShell
      user={user}
      role={role}
      brand={{
        icon: IconWallet,
        subLabel: financeCopy.shell.subLabel,
        mainLabel: financeCopy.shell.mainLabel,
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle={financeCopy.shell.defaultPageTitle}
      pageHeader={{
        crumbLabel: financeCopy.shell.crumbLabel,
        description: financeCopy.shell.description,
        actions: (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/dashboard">{financeCopy.shell.admin}</Link>
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
