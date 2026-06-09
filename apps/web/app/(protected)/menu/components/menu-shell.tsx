"use client";

import Link from "next/link";
import {
  LayoutDashboard as IconLayoutDashboard,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import type { ReactNode } from "react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Thực đơn",
    items: [{ href: "/menu", label: "Thực đơn", icon: IconLayoutDashboard }],
  },
];

export interface MenuShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function MenuShell({ children, user, role }: MenuShellProps) {
  const homeLink = resolveRoleHomeLink(role);

  return (
    <AppShell
      user={user}
      role={role}
      brand={{
        icon: IconToolsKitchen,
        subLabel: "Chuyên trách",
        mainLabel: "Thực đơn",
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle="Thực đơn"
      pageHeader={{
        crumbLabel: "Catalog · Thực đơn",
        description:
          "Nhập danh mục, món ăn, biến thể và topping cho toàn chuỗi tại cùng một nơi.",
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
