"use client";

import { Fragment, useMemo, type ReactNode } from "react";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@comtammatu/ui/components/breadcrumb";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
  isNavItemActive,
  formatPathSegment,
  getInitials,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { workspaceThemeProps } from "@/lib/workspace-theme";

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
  const breadcrumbSegments = pageContext.trail.slice(0, -1);
  const trail = breadcrumbSegments.join(" · ");

  return (
    <SidebarProvider>
      <div
        {...workspaceThemeProps("admin")}
        className="workspace-shell flex min-h-dvh w-full"
      >
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader className="gap-4 p-4">
            <div className="workspace-sidebar-card">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <ShieldCheck className="size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                    Cơm Tấm Má Tư
                  </p>
                  <p className="text-xl font-semibold leading-none">Quản trị</p>
                  <p className="text-sm leading-6 text-sidebar-foreground/70">
                    Truy cập báo cáo, cài đặt, nhân viên và các mục quản lý theo
                    đúng quyền được cấp.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-xs text-sidebar-foreground/75">
                <div className="rounded-2xl border border-sidebar-border/80 bg-sidebar/75 px-3 py-2.5 backdrop-blur-sm">
                  <p className="font-semibold">{APP_COPY_VI.quickAccess}</p>
                  <p className="mt-1 leading-5">
                    Các mục quan trọng được gom theo nhóm để thao tác nhanh hơn.
                  </p>
                </div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="px-2 pb-4">
            {navGroups.map((group) => (
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
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SidebarTrigger />
                    {breadcrumbSegments.length > 0 ? (
                      <Breadcrumb>
                        <BreadcrumbList>
                          {breadcrumbSegments.map((segment, idx) => (
                            <Fragment key={`${segment}-${String(idx)}`}>
                              <BreadcrumbItem>
                                <BreadcrumbPage className="font-normal text-muted-foreground">
                                  {segment}
                                </BreadcrumbPage>
                              </BreadcrumbItem>
                              {idx < breadcrumbSegments.length - 1 && (
                                <BreadcrumbSeparator />
                              )}
                            </Fragment>
                          ))}
                        </BreadcrumbList>
                      </Breadcrumb>
                    ) : (
                      <span className="workspace-context-pill">
                        {APP_COPY_VI.adminFoundation}
                      </span>
                    )}
                    <Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      {pageContext.title}
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                      Quản lý cửa hàng theo đúng quyền được cấp cho vai trò hiện
                      tại.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/employee">Cổng nhân viên</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/admin/reports">
                      {APP_COPY_VI.executiveReporting}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="workspace-highlight-card mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Item
                    variant="outline"
                    className="workspace-metric-card flex-col items-start gap-2 px-4 py-3"
                  >
                    <ItemDescription className="text-xs font-semibold uppercase tracking-widest">
                      Vai trò
                    </ItemDescription>
                    <ItemTitle className="text-lg font-semibold">
                      {ROLE_LABEL_VI[role]}
                    </ItemTitle>
                  </Item>
                  <Item
                    variant="outline"
                    className="workspace-metric-card flex-col items-start gap-2 px-4 py-3"
                  >
                    <ItemDescription className="text-xs font-semibold uppercase tracking-widest">
                      Điều hướng
                    </ItemDescription>
                    <ItemTitle className="text-sm font-normal leading-6 text-foreground">
                      {navGroups.length} nhóm chức năng
                    </ItemTitle>
                  </Item>
                  <Item
                    variant="outline"
                    className="workspace-metric-card flex-col items-start gap-2 px-4 py-3"
                  >
                    <ItemDescription className="text-xs font-semibold uppercase tracking-widest">
                      Ngữ cảnh
                    </ItemDescription>
                    <ItemTitle className="text-sm font-normal leading-6 text-foreground">
                      {trail || APP_COPY_VI.adminSurface}
                    </ItemTitle>
                  </Item>
                </div>
                <Item
                  variant="outline"
                  className="workspace-metric-card items-center gap-3 px-4 py-3"
                >
                  <ItemMedia>
                    <Avatar size="sm">
                      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="truncate text-sm font-semibold">
                      {user.name}
                    </ItemTitle>
                    <ItemDescription className="truncate text-xs">
                      {ROLE_LABEL_VI[role]}
                    </ItemDescription>
                  </ItemContent>
                </Item>
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
