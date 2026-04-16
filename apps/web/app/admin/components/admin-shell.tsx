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
      description="Đổi toàn bộ bố cục sang một buồng lái quản trị mới, nhưng vẫn giữ nguyên route, ACL và luồng nghiệp vụ hiện có."
      badge={<Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>}
      sidebarHeader={
        <div className="rounded-3xl border border-sidebar-border/70 bg-sidebar-accent/70 p-4 text-sidebar-foreground shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                Cơm Tấm Má Tư
              </p>
              <p className="font-heading text-2xl font-semibold leading-none">
                Quản trị
              </p>
              <p className="text-sm leading-6 text-sidebar-foreground/70">
                Khung điều hành mới cho dashboard, báo cáo, nhân sự nền và ERP.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-xs text-sidebar-foreground/75">
            <div className="rounded-2xl border border-sidebar-border/60 bg-sidebar px-3 py-2.5">
              <p className="font-semibold">{APP_COPY_VI.quickAccess}</p>
              <p className="mt-1 leading-5">
                Dashboard, báo cáo, tài chính và vận hành tập trung trong một shell thống nhất.
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
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Vai trò
              </p>
              <p className="mt-2 font-heading text-2xl font-semibold">
                {ROLE_LABEL_VI[role]}
              </p>
            </div>
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Hệ surface
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {navGroups.length} nhóm điều hướng theo ACL
              </p>
            </div>
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Truy cập nhanh
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {trail || APP_COPY_VI.adminSurface}
              </p>
            </div>
          </div>
          <div className="app-subpanel flex items-center gap-3 p-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL_VI[role]}
              </p>
            </div>
          </div>
        </div>
      }
      sidebarFooter={
        <div className="rounded-3xl border border-sidebar-border/70 bg-sidebar-accent/70 p-3 shadow-sm">
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
