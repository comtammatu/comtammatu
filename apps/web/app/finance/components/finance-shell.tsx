"use client";

import Link from "next/link";
import {
  ArrowLeftRight as IconArrowLeftRight,
  ChartBar as IconChartBar,
  Book as IconBook,
  CalendarDays as IconCalendarEvent,
  FileText as IconFileText,
  Receipt as IconReceipt,
  ScrollText as IconScrollText,
  SlidersHorizontal as IconSettings2,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import type { ShellNavGroup } from "@/lib/shell-primitives";

const financeCopy = messages.finance;

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: financeCopy.nav.groups.overview,
    items: [
      { href: "/finance", label: financeCopy.nav.items.finance, icon: IconWallet },
      {
        href: "/finance/revenue",
        label: financeCopy.nav.items.revenue,
        icon: IconTrendingUp,
      },
      {
        href: "/finance/reconciliation",
        label: financeCopy.nav.items.reconciliation,
        icon: IconArrowLeftRight,
      },
    ],
  },
  {
    title: financeCopy.nav.groups.accounting,
    items: [
      {
        href: "/finance/chart-of-accounts",
        label: financeCopy.nav.items.chartOfAccounts,
        icon: IconBook,
      },
      {
        href: "/finance/journal",
        label: financeCopy.nav.items.journal,
        icon: IconFileText,
      },
      {
        href: "/finance/posting-rules",
        label: financeCopy.nav.items.postingRules,
        icon: IconSettings2,
      },
    ],
  },
  {
    title: financeCopy.nav.groups.reports,
    items: [
      {
        href: "/finance/statements",
        label: financeCopy.nav.items.statements,
        icon: IconChartBar,
      },
      {
        href: "/finance/food-cost",
        label: financeCopy.nav.items.foodCost,
        icon: IconReceipt,
      },
    ],
  },
  {
    title: financeCopy.nav.groups.cycle,
    items: [
      {
        href: "/finance/periods",
        label: financeCopy.nav.items.periods,
        icon: IconCalendarEvent,
      },
    ],
  },
  {
    title: financeCopy.nav.groups.audit,
    items: [
      {
        href: "/finance/audit-trail",
        label: financeCopy.nav.items.auditTrail,
        icon: IconScrollText,
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
              <Link href="/finance/statements">
                {financeCopy.shell.financialStatements}
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
