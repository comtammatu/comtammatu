"use client";

import Link from "next/link";
import { Briefcase as IconBriefcase } from "lucide-react";
import type { ReactNode } from "react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

const copy = messages.hr.shell;

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: copy.navTitle,
    items: [
      { href: "/hr", label: copy.navMain, icon: IconBriefcase },
    ],
  },
];

export interface HRShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
}

export function HRShell({ children, user, role, branchId }: HRShellProps) {
  const homeLink = resolveRoleHomeLink(role, branchId);

  return (
    <AppShell
      user={user}
      role={role}
      branchId={branchId}
      brand={{
        icon: IconBriefcase,
        subLabel: copy.brandSubLabel,
        mainLabel: APP_COPY_VI.hrWorkspace,
      }}
      navGroups={NAV_GROUPS}
      defaultPageTitle={copy.defaultPageTitle}
      pageHeader={{
        crumbLabel: APP_COPY_VI.hrWorkspaceSubtitle,
        description: copy.pageDescription,
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
