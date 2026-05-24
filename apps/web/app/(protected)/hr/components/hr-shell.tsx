"use client";

import Link from "next/link";
import {
  Briefcase as IconBriefcase,
  Wallet as IconWallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Nhân sự",
    items: [
      { href: "/hr", label: "Nhân sự & chấm công", icon: IconBriefcase },
      {
        href: "/hr/payroll",
        label: "Bảng lương",
        icon: IconWallet,
        matchPrefixes: ["/hr/payroll/"],
      },
    ],
  },
];

export interface HRShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function HRShell({ children, user, role }: HRShellProps) {
  return (
    <AppShell
      user={user}
      role={role}
      brand={{
        icon: IconBriefcase,
        subLabel: "Chuyên trách",
        mainLabel: APP_COPY_VI.hrWorkspace,
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle="Tổng quan"
      pageHeader={{
        crumbLabel: APP_COPY_VI.hrWorkspaceSubtitle,
        description:
          "Xử lý nhân sự, chấm công và bảng lương trong cùng một nơi.",
        actions: (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/dashboard">Quản trị</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/hr/payroll">Bảng lương</Link>
            </Button>
          </>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
