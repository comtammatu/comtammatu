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
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { workspaceThemeProps } from "@/lib/workspace-theme";

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
    <SidebarProvider>
      <div
        {...workspaceThemeProps("hr")}
        className="workspace-shell flex min-h-dvh w-full"
      >
        <Sidebar variant="inset">
          <SidebarHeader className="gap-4 p-4">
            <div className="workspace-sidebar-card">
              <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Quản trị
              </Link>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Briefcase className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                    Chuyên trách
                  </p>
                  <p className="text-xl font-semibold">
                    {APP_COPY_VI.hrWorkspace}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-sidebar-foreground/72">
                Tập trung ca làm, chấm công và bảng lương trong cùng một tuyến
                thao tác.
              </p>
            </div>
          </SidebarHeader>

          <SidebarContent className="px-2 pb-4">
            {NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.title} className="px-0 py-1">
                <SidebarGroupLabel className="px-2 pb-1 text-xs font-medium text-sidebar-foreground/70">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          size="lg"
                          tooltip={item.label}
                          className="rounded-md"
                        >
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">
            <div className="workspace-sidebar-card p-3 group-data-[collapsible=icon]:p-2">
              <div className="flex items-center gap-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-2">
                <Avatar size="sm">
                  <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
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
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-dvh bg-background/70 backdrop-blur-[2px]">
          <div className="flex min-h-full flex-1 flex-col gap-4 p-4">
            <header className="workspace-header-card">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SidebarTrigger className="md:hidden" />
                    <span className="workspace-context-pill">
                      {APP_COPY_VI.hrWorkspaceSubtitle}
                    </span>
                    <Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      {pageTitle}
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                      Xử lý nhân sự, chấm công và bảng lương trong cùng một nơi.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin/dashboard">Quản trị</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/hr/payroll">Bảng lương</Link>
                  </Button>
                </div>
              </div>

              <div className="workspace-highlight-card mt-4">
                <div className="grid gap-3 md:grid-cols-2 md:items-start">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="workspace-metric-card">
                      <CardContent className="space-y-2 p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Vai trò
                        </p>
                        <p className="text-lg font-semibold">
                          {ROLE_LABEL_VI[role]}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="workspace-metric-card">
                      <CardContent className="space-y-2 p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Khu làm việc
                        </p>
                        <p className="text-sm leading-6 text-foreground">
                          Tuyến nghiệp vụ nhân sự tập trung
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="workspace-metric-card">
                      <CardContent className="space-y-2 p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Điều hướng
                        </p>
                        <p className="text-sm leading-6 text-foreground">
                          {NAV_GROUPS[0]?.items.length ?? 0} điểm vào chính
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card className="workspace-metric-card">
                    <CardContent className="flex items-center gap-3 p-4">
                      <Avatar size="sm">
                        <AvatarFallback>
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ROLE_LABEL_VI[role]}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </header>

            <main id="main-content" className="flex-1">
              <div className="space-y-4">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
