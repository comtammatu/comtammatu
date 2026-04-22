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

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                Cơm Tấm Má Tư
              </p>
              <p className="text-lg font-semibold leading-none">Quản trị</p>
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

          <SidebarFooter className="p-2">
            <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
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
                  size="icon-sm"
                  className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                  aria-label="Đăng xuất"
                >
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex flex-col gap-4 border-b p-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1 space-y-3">
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
                <Badge variant="outline">{APP_COPY_VI.adminFoundation}</Badge>
              )}
              <Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {pageContext.title}
              </h1>
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
        </header>

        <main id="main-content" className="flex-1 p-4">
          <div className="space-y-4">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
