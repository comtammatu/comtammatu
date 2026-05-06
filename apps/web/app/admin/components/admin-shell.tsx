"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartBar as IconChartBar,
  Briefcase as IconBriefcase,
  ChefHat as IconChefHat,
  LayoutDashboard as IconLayoutDashboard,
  MessageSquare as IconMessageSquare,
  Monitor as IconDeviceDesktop,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  ShieldCheck as IconShieldCheck,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
  Wallet as IconWallet,
} from "lucide-react";
import {
  canAccess,
  resolveAdminNavGroups,
  type ResolvedNavGroup as SharedResolvedNavGroup,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import {
  findActiveNavItem,
  formatPathSegment,
  type ShellNavGroup,
} from "@/lib/shell-primitives";

const ADMIN_ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard: IconLayoutDashboard,
  BarChart3: IconChartBar,
  Users: IconUsers,
  Wallet: IconWallet,
  Package: IconPackage,
  Briefcase: IconBriefcase,
  Monitor: IconDeviceDesktop,
  Settings: IconSettings,
  ChefHat: IconChefHat,
  Receipt: IconReceipt,
  ToolsKitchen: IconToolsKitchen,
  ShieldCheck: IconShieldCheck,
  MessageSquare: IconMessageSquare,
};

function mapResolvedNavGroups(
  groups: SharedResolvedNavGroup[],
): ShellNavGroup[] {
  return groups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: (ADMIN_ICON_MAP[item.icon] ??
        IconLayoutDashboard) as typeof IconLayoutDashboard,
    })),
  }));
}

function buildBreadcrumbTrail(
  pathname: string,
  groups: ShellNavGroup[],
): string[] {
  const active = findActiveNavItem(groups, pathname);
  if (!active) return [APP_COPY_VI.adminSurface];
  const pathTail = pathname
    .slice(active.href.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => formatPathSegment(segment));
  return [APP_COPY_VI.adminSurface, active.label, ...pathTail];
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

  const navGroups = useMemo(
    () => mapResolvedNavGroups(resolveAdminNavGroups(role)),
    [role],
  );
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
        crumbLabel: APP_COPY_VI.adminFoundation,
        actions: (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/employee">Cổng nhân viên</Link>
            </Button>
            {canAccess(role, "reports") && (
              <Button asChild size="sm">
                <Link href="/admin/reports">
                  {APP_COPY_VI.executiveReporting}
                </Link>
              </Button>
            )}
          </>
        ),
      }}
      collapsible="icon"
    >
      {children}
    </AppShell>
  );
}
