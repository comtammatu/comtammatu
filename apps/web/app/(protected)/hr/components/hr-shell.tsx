"use client";

import Link from "next/link";
import { Briefcase as IconBriefcase } from "lucide-react";
import type { ReactNode } from "react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Nhân sự",
    items: [
      { href: "/hr", label: "Nhân viên, ca, công", icon: IconBriefcase },
    ],
  },
];

export interface HRShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function HRShell({ children, user, role }: HRShellProps) {
  const homeLink = resolveRoleHomeLink(role);

  return (
    <AppShell
      user={user}
      role={role}
      brand={{
        icon: IconBriefcase,
        subLabel: "Hộ Kinh Doanh",
        mainLabel: APP_COPY_VI.hrWorkspace,
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle="Tổng quan"
      pageHeader={{
        crumbLabel: APP_COPY_VI.hrWorkspaceSubtitle,
        description:
          "Theo dõi nhân viên, ca làm và ngày công cho vận hành hằng ngày.",
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
