"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  ChevronRight,
  ChefHat,
  ExternalLink,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  Monitor,
  Package,
  PanelLeft,
  PanelLeftClose,
  Receipt,
  Settings,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  ROLE_LABEL_VI,
  resolveAdminNavGroups,
  resolveQuickLaunchGroups,
  type ResolvedNavGroup as SharedResolvedNavGroup,
  type ResolvedNavLink,
} from "@comtammatu/shared/auth";
import type { ModuleKey } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
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
  useSidebar,
} from "@comtammatu/ui/components/sidebar";
import {
  SearchParamBlockedStateFlash,
} from "@/components/foundation/blocked-state-flash";
import { StatusBadge } from "@comtammatu/ui/components/admin-patterns";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";

const ADMIN_ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  BarChart3,
  Users,
  Heart,
  Wallet,
  Package,
  Briefcase,
  Monitor,
  Settings,
  ChefHat,
  Receipt,
  UtensilsCrossed,
};

interface ResolvedNavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  moduleKey: ModuleKey;
}

type ResolvedNavGroup = {
  title: SharedResolvedNavGroup["title"];
  items: ResolvedNavItem[];
};

type UiQuickLaunchGroup = {
  title: string;
  items: ResolvedNavItem[];
};

interface BreadcrumbItem {
  label: string;
  href?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase();
}

function mapResolvedNavLink(item: ResolvedNavLink): ResolvedNavItem {
  return {
    label: item.label,
    href: item.href,
    icon: ADMIN_ICON_MAP[item.icon] ?? LayoutDashboard,
    moduleKey: item.moduleKey,
  };
}

function mapResolvedNavGroups(groups: SharedResolvedNavGroup[]): ResolvedNavGroup[] {
  return groups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => mapResolvedNavLink(item)),
  }));
}

const SEGMENT_LABEL_VI: Record<string, string> = {
  "purchase-orders": "Đặt hàng (PO)",
  grn: "Nhập kho (GRN)",
  transfers: "Luân chuyển",
  suppliers: "Nhà cung cấp",
  "supplier-invoices": "HĐ NCC",
  recipes: "Công thức",
};

function toBreadcrumbLabel(segment: string): string {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  if (SEGMENT_LABEL_VI[segment]) return SEGMENT_LABEL_VI[segment];
  return segment
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function buildBreadcrumb(
  pathname: string,
  navItems: ResolvedNavItem[],
): { title: string; items: BreadcrumbItem[] } {
  const matchedItem = navItems
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (!matchedItem) {
    return {
      title: APP_COPY_VI.adminSurface,
      items: [{ label: APP_COPY_VI.adminSurface, href: "/admin/dashboard" }],
    };
  }

  const pathTail = pathname
    .slice(matchedItem.href.length)
    .split("/")
    .filter(Boolean);
  const tailItems = pathTail.map((segment, index) => {
    const isLast = index === pathTail.length - 1;
    return {
      label: toBreadcrumbLabel(decodeURIComponent(segment)),
      href: isLast
        ? undefined
        : `${matchedItem.href}/${pathTail.slice(0, index + 1).join("/")}`,
    };
  });

  const items: BreadcrumbItem[] = [
    { label: APP_COPY_VI.adminSurface, href: "/admin/dashboard" },
    {
      label: matchedItem.label,
      href: pathTail.length > 0 ? matchedItem.href : undefined,
    },
    ...tailItems,
  ];

  return {
    title: tailItems.at(-1)?.label ?? matchedItem.label,
    items,
  };
}

function QuickLaunchMenu({
  groups,
  compact = false,
}: {
  groups: UiQuickLaunchGroup[];
  compact?: boolean;
}) {
  if (groups.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          className={cn(
            compact
              ? "min-h-11 min-w-11 size-8 text-muted-foreground hover:text-foreground"
              : "min-h-11 min-w-11 h-9 gap-2 rounded-full border-border/70 bg-background/90 px-3 text-foreground shadow-sm hover:bg-muted/80",
          )}
          aria-label={APP_COPY_VI.quickAccessAria}
        >
          <ExternalLink className="size-4" />
          {!compact && (
            <>
              <span className="font-medium">{APP_COPY_VI.quickAccess}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {groups.map((group, groupIndex) => (
          <div key={group.title}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="flex items-center gap-2">
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                    <ExternalLink className="ml-auto size-3 opacity-60" />
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({
  groups,
  pathname,
  onNavigate,
}: {
  groups: ResolvedNavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobile = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarContent>
      {groups.map((group, groupIndex) => (
        <SidebarGroup key={`${group.title || "default"}-${groupIndex}`}>
          {group.title ? <SidebarGroupLabel>{group.title}</SidebarGroupLabel> : null}
          <SidebarMenu>
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              const navigate = () => {
                onNavigate?.();
                closeMobile();
              };

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                  >
                    <Link href={item.href} onClick={navigate}>
                      <Icon className="size-4" />
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
  );
}

function SidebarUserFooter({
  user,
  role,
}: {
  user: { name: string };
  role: StaffRole;
}) {
  return (
    <SidebarFooter className="pt-2">
      <div className="flex items-center gap-3 px-2 py-2">
        <Avatar className="size-8">
          <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {user.name}
          </p>
          <p className="truncate text-xs font-medium text-sidebar-foreground/45">
            {ROLE_LABEL_VI[role]}
          </p>
        </div>
        <form action="/api/auth/signout" method="post">
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-8 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            aria-label="Đăng xuất"
          >
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </SidebarFooter>
  );
}

interface AdminShellProps {
  children: React.ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
}

export function AdminShell({
  children,
  user,
  role,
  branchId,
}: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const filteredGroups = useMemo(
    () => mapResolvedNavGroups(resolveAdminNavGroups(role)),
    [role],
  );
  const quickLaunchGroups = useMemo(
    () =>
      resolveQuickLaunchGroups(role, branchId).map((group) => ({
        title: group.title,
        items: group.items.map((item) => mapResolvedNavLink(item)),
      })),
    [branchId, role],
  );
  const navItems = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );
  const workspaceLabel = branchId ? `Chi nhánh #${branchId}` : "Toàn hệ thống";
  const headerBreadcrumb = useMemo(
    () => buildBreadcrumb(pathname, navItems),
    [pathname, navItems],
  );
  const quickLaunchCount = quickLaunchGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );

  return (
    <SidebarProvider
      defaultOpen
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
    >
      <div className="flex min-h-screen w-full overflow-hidden bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="gap-3 px-2 py-3">
            <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent p-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-lg font-extrabold text-sidebar-primary-foreground">
                MT
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                  {APP_COPY_VI.erpCockpit}
                </p>
                <span className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">
                  Cơm Tấm Má Tư
                </span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarNav groups={filteredGroups} pathname={pathname} />

          <SidebarUserFooter user={user} role={role} />
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b bg-background px-4 py-3 sm:px-6">
            <SidebarTrigger className="md:hidden" />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground hidden md:block">
                {APP_COPY_VI.adminFoundation}
              </p>
              <nav
                aria-label="Breadcrumb"
                className="hidden items-center gap-1 pt-1 text-xs text-muted-foreground md:flex"
              >
                {headerBreadcrumb.items.map((item, index) => {
                  const isLast = index === headerBreadcrumb.items.length - 1;
                  return (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-1">
                      {index > 0 && (
                        <ChevronRight className="size-3 text-muted-foreground/70" />
                      )}
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="truncate hover:text-foreground focus-visible:outline-none focus-visible:underline"
                        >
                          {index === 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Home className="size-3.5" />
                              {item.label}
                            </span>
                          ) : (
                            item.label
                          )}
                        </Link>
                      ) : (
                        <span
                          className={cn(
                            "truncate font-medium",
                            isLast ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </nav>
              <p className="truncate text-sm font-semibold text-foreground md:hidden">
                {headerBreadcrumb.title}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Chuyển trạng thái sidebar"
                onClick={() => setSidebarOpen((open) => !open)}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeft className="size-4" />
                )}
              </Button>
              <div className="hidden md:block">
                <QuickLaunchMenu groups={quickLaunchGroups} />
              </div>
            </div>

            <div className="flex items-center gap-1 md:hidden">
              <QuickLaunchMenu groups={quickLaunchGroups} compact />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 size-8"
                    aria-label="Menu tài khoản"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-medium">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL_VI[role]}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <form action="/api/auth/signout" method="post">
                      <button className="flex w-full items-center gap-2" type="submit">
                        <LogOut className="size-4" />
                        <span>Đăng xuất</span>
                      </button>
                    </form>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-screen-2xl flex-col">
              <div className="mb-5 hidden md:block">
                <Card>
                  <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <CardDescription>Quản trị</CardDescription>
                      <CardTitle>{ROLE_LABEL_VI[role]}</CardTitle>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusBadge
                        tone="info"
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                      >
                        Vai trò {ROLE_LABEL_VI[role]}
                      </StatusBadge>
                      <StatusBadge
                        tone="neutral"
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                      >
                        {workspaceLabel}
                      </StatusBadge>
                      <Badge
                        variant={quickLaunchCount > 0 ? "success" : "warning"}
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                      >
                        {navItems.length} mục chính · {quickLaunchCount} truy cập nhanh
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              </div>
              <div>{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>

      <Suspense fallback={null}>
        <SearchParamBlockedStateFlash mode="toast" autoClear />
      </Suspense>
    </SidebarProvider>
  );
}
