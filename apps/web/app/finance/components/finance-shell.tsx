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
import type { ShellNavGroup } from "@/lib/shell-primitives";

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Tổng quan",
    items: [
      { href: "/finance", label: "Tài chính", icon: IconWallet },
      { href: "/finance/revenue", label: "Doanh thu", icon: IconTrendingUp },
      {
        href: "/finance/reconciliation",
        label: "Đối chiếu",
        icon: IconArrowLeftRight,
      },
    ],
  },
  {
    title: "Kế toán",
    items: [
      {
        href: "/finance/chart-of-accounts",
        label: "Hệ thống tài khoản",
        icon: IconBook,
      },
      { href: "/finance/journal", label: "Sổ nhật ký", icon: IconFileText },
      {
        href: "/finance/posting-rules",
        label: "Quy tắc hạch toán",
        icon: IconSettings2,
      },
    ],
  },
  {
    title: "Báo cáo",
    items: [
      {
        href: "/finance/statements",
        label: "Báo cáo tài chính",
        icon: IconChartBar,
      },
      { href: "/finance/food-cost", label: "Giá vốn món", icon: IconReceipt },
    ],
  },
  {
    title: "Chu kỳ",
    items: [
      { href: "/finance/periods", label: "Kỳ kế toán", icon: IconCalendarEvent },
    ],
  },
  {
    title: "Kiểm toán",
    items: [
      {
        href: "/finance/audit-trail",
        label: "Nhật ký kiểm toán",
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
        subLabel: "Kế toán",
        mainLabel: "Tài chính",
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle="Tài chính"
      pageHeader={{
        crumbLabel: "Kế toán · Tài chính",
        description:
          "Tập trung sổ sách, báo cáo và HĐĐT trong cùng cấu trúc điều hướng.",
        actions: (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/dashboard">Quản trị</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/finance/statements">Báo cáo tài chính</Link>
            </Button>
          </>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
