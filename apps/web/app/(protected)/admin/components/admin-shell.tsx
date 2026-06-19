"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck as IconShieldCheck } from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import {
  findActiveNavItem,
  formatPathSegment,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { resolveOfficeNavGroups } from "@/lib/office-nav";

function buildBreadcrumbTrail(
  pathname: string,
  groups: ShellNavGroup[],
): Array<{ label: string; href?: string }> {
  const active = findActiveNavItem(groups, pathname);
  if (!active) return [{ label: APP_COPY_VI.adminSurface }];
  const tailSegments = pathname.slice(active.href.length).split("/").filter(Boolean);
  let accumulatedHref = active.href;
  const pathTail = tailSegments.map((segment) => {
    accumulatedHref = `${accumulatedHref}/${segment}`;
    return { label: formatPathSegment(segment), href: accumulatedHref };
  });
  return [
    { label: APP_COPY_VI.adminSurface, href: "/admin/dashboard" },
    { label: active.label, href: active.href },
    ...pathTail,
  ];
}

export function AdminShell({
  user,
  role,
  branchId: _branchId,
  children,
}: {
  user: { name: string };
  role: StaffRole;
  branchId: number | null;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const navGroups = useMemo(() => resolveOfficeNavGroups(role), [role]);
  const breadcrumbSegments = useMemo(
    () => buildBreadcrumbTrail(pathname, navGroups).slice(0, -1),
    [navGroups, pathname],
  );

  return (
    <AppShell
      user={user}
      role={role}
      brand={{
        icon: IconShieldCheck,
        subLabel: "Cơm Tấm Má Tư",
        mainLabel: "Quản trị",
        showBackLink: false,
      }}
      navGroups={navGroups}
      defaultPageTitle={APP_COPY_VI.adminSurface}
      pageHeader={{
        breadcrumbSegments,
        crumbLabel: APP_COPY_VI.storeManagement,
        actions: canAccess(role, "employee") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/employee">{MODULE_LABELS_VI.employee}</Link>
          </Button>
        ) : undefined,
      }}
      collapsible="icon"
    >
      {children}
    </AppShell>
  );
}
