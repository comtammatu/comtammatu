"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Monitor,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  ROLE_LABEL_VI,
  resolveAdminNavGroups,
  type ResolvedNavGroup as SharedResolvedNavGroup,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { WorkspaceShell } from "@/components/workspace-shell";

const ADMIN_ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  BarChart3,
  Users,
  Wallet,
  Package,
  Briefcase,
  Monitor,
  Settings,
  ChefHat,
  Receipt,
  UtensilsCrossed,
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
        LayoutDashboard) as typeof LayoutDashboard,
    })),
  }));
}

function buildContext(
  pathname: string,
  groups: ShellNavGroup[],
): { title: string; trail: string[] } {
  const active = findActiveNavItem(groups, pathname);
  if (!active) {
    return {
      title: APP_COPY_VI.adminSurface,
      trail: [APP_COPY_VI.adminSurface],
    };
  }

  const pathTail = pathname
    .slice(active.href.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => formatPathSegment(segment));

  return {
    title: pathTail[pathTail.length - 1] ?? active.label,
    trail: [APP_COPY_VI.adminSurface, active.label, ...pathTail],
  };
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
  const pageContext = useMemo(
    () => buildContext(pathname, navGroups),
    [navGroups, pathname],
  );
  const trail = pageContext.trail.slice(0, -1).join(" · ");

  return (
    <WorkspaceShell
      pathname={pathname}
      navGroups={navGroups}
      title={pageContext.title}
      eyebrow={trail || APP_COPY_VI.adminFoundation}
      description="Điều hướng quản trị theo ACL cho dashboard, báo cáo, nhân sự nền và các phân hệ ERP hiện có."
      badge={<Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>}
      sidebarHeader={
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-4 text-sidebar-foreground">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                Cơm Tấm Má Tư
              </p>
              <p className="text-xl font-semibold leading-none">
                Quản trị
              </p>
              <p className="text-sm leading-6 text-sidebar-foreground/70">
                Truy cập dashboard, báo cáo, nhân sự nền và ERP theo đúng phạm vi phân quyền.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-xs text-sidebar-foreground/75">
            <div className="rounded-md border border-sidebar-border bg-sidebar px-3 py-2.5">
              <p className="font-semibold">{APP_COPY_VI.quickAccess}</p>
              <p className="mt-1 leading-5">
                Dashboard, báo cáo, tài chính và vận hành được gom theo cùng cấu trúc điều hướng.
              </p>
            </div>
          </div>
        </div>
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/employee">Cổng nhân viên</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/reports">{APP_COPY_VI.executiveReporting}</Link>
          </Button>
        </>
      }
      headerMeta={
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Vai trò
                </p>
                <p className="text-lg font-semibold">{ROLE_LABEL_VI[role]}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Hệ surface
                </p>
                <p className="text-sm leading-6 text-foreground">
                  {navGroups.length} nhóm điều hướng theo ACL
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Truy cập nhanh
                </p>
                <p className="text-sm leading-6 text-foreground">
                  {trail || APP_COPY_VI.adminSurface}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Avatar size="sm">
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL_VI[role]}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
      sidebarFooter={
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/65">
                {ROLE_LABEL_VI[role]}
              </p>
            </div>
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon-lg"
                className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                aria-label="Đăng xuất"
              >
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
