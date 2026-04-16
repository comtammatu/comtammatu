"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  LogOut,
  Users,
  Wallet,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
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

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Nhân sự",
    items: [
      { href: "/hr", label: "Tổng quan", icon: Briefcase },
      {
        href: "/hr/employees",
        label: "Nhân viên",
        icon: Users,
        matchPrefixes: ["/hr/employee"],
      },
      { href: "/hr/shifts", label: "Ca làm việc", icon: CalendarDays },
      { href: "/hr/attendance", label: "Chấm công", icon: ClipboardList },
      {
        href: "/hr/payroll",
        label: "Bảng lương",
        icon: Wallet,
        matchPrefixes: ["/hr/payroll/"],
      },
      { href: "/hr/reports", label: "Báo cáo", icon: BarChart3 },
    ],
  },
];

function resolveTitle(pathname: string) {
  const active = findActiveNavItem(NAV_GROUPS, pathname);
  if (!active) return "Tổng quan";

  const pathTail = pathname
    .slice(active.href.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => formatPathSegment(segment));

  return pathTail[pathTail.length - 1] ?? active.label;
}

export interface HRShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function HRShell({ children, user, role }: HRShellProps) {
  const pathname = usePathname();
  const pageTitle = useMemo(() => resolveTitle(pathname), [pathname]);

  return (
    <WorkspaceShell
      pathname={pathname}
      navGroups={NAV_GROUPS}
      title={pageTitle}
      eyebrow={APP_COPY_VI.hrWorkspaceSubtitle}
      description="Thiết kế lại hoàn toàn không gian nhân sự và tiền lương để đọc nhanh hơn, bớt cảm giác bảng điều khiển cũ, nhưng vẫn giữ nguyên route và phân quyền."
      badge={<Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>}
      sidebarHeader={
        <div className="rounded-3xl border border-sidebar-border/70 bg-sidebar-accent/70 p-4 text-sidebar-foreground shadow-sm">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Quản trị
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Briefcase className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                Chuyên trách
              </p>
              <p className="font-heading text-2xl font-semibold">
                {APP_COPY_VI.hrWorkspace}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-sidebar-foreground/72">
            Tập trung ca làm, chấm công và bảng lương trong cùng một khung thao tác mới.
          </p>
        </div>
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/dashboard">Quản trị</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/hr/payroll">Bảng lương</Link>
          </Button>
        </>
      }
      headerMeta={
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <div className="grid gap-3 sm:grid-cols-3">
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
                Khu làm việc
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                Tuyến nghiệp vụ nhân sự tập trung
              </p>
            </div>
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Điều hướng
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {NAV_GROUPS[0]?.items.length ?? 0} điểm vào chính
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
