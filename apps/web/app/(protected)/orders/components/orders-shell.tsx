"use client";

import Link from "next/link";
import { Receipt as IconReceipt } from "lucide-react";
import type { ReactNode } from "react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";

import { ORDER_VI } from "@comtammatu/shared/messages";

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Đơn hàng",
    items: [{ href: "/orders", label: "Đơn hàng", icon: IconReceipt }],
  },
];

export interface OrdersShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function OrdersShell({ children, user, role }: OrdersShellProps) {
  const homeLink = resolveRoleHomeLink(role);

  return (
    <AppShell
      user={user}
      role={role}
      brand={{
        icon: IconReceipt,
        subLabel: "Đối soát",
        mainLabel: ORDER_VI.long,
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle="Đơn hàng"
      pageHeader={{
        crumbLabel: "Đối soát · Đơn hàng",
        description:
          "Tra cứu lịch sử đơn hàng, xử lý hoàn tiền và đối soát doanh thu.",
        actions: (
          <Button asChild variant="outline" size="sm">
            <Link href={homeLink.href}>{homeLink.label}</Link>
          </Button>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
