"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  BarChart3,
  Briefcase,
  Check,
  ChefHat,
  ChevronRight,
  ExternalLink,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
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
import {
  cn,
  getSurfaceHeaderClassName,
  getSurfaceShellClassName,
  getSurfaceSidebarClassName,
} from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Separator } from "@comtammatu/ui/components/separator";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { SearchParamBlockedStateFlash } from "@/components/foundation/blocked-state-flash";
import { StatusBadge } from "@/components/foundation/ui-patterns";

/* ─── Icon registry (Lucide name → component) ─── */

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  UtensilsCrossed,
  Receipt,
  Users,
  Heart,
  Wallet,
  BarChart3,
  Settings,
  Package,
  Briefcase,
  Monitor,
  ChefHat,
};

/* ─── Helpers ─── */

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase();
}

/* ─── Derive nav from MODULE_ACL + ADMIN_NAV_GROUPS ─── */

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

function mapResolvedNavLink(item: ResolvedNavLink): ResolvedNavItem {
  return {
    label: item.label,
    href: item.href,
    icon: ICON_MAP[item.icon] ?? LayoutDashboard,
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

/* ─── Quick launch menu for adjacent workspaces and branch tools ─── */

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
              ? "touch-target size-8 text-muted-foreground hover:text-foreground"
              : "touch-target h-9 gap-2 rounded-full border-border/70 bg-background/90 px-3 text-foreground shadow-sm hover:bg-muted/80",
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

/* ─── Sidebar Navigation (shared between desktop & mobile sheet) ─── */

function SidebarNav({
  groups,
  pathname,
  onNavigate,
  collapsed = false,
}: {
  groups: ResolvedNavGroup[];
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <nav className={collapsed ? "space-y-1" : "space-y-5"}>
      {groups.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              {group.title}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "touch-target group relative flex items-center justify-center rounded-lg py-2.5 transition-all",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                        )}
                        <Icon
                          className={cn(
                            "size-4.5 shrink-0 transition-colors",
                            isActive
                              ? "text-sidebar-primary"
                              : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70",
                          )}
                        />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "touch-target group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                  )}
                  <Icon
                    className={cn(
                      "size-4.5 shrink-0 transition-colors",
                      isActive
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/* ─── Sidebar User Footer ─── */

function SidebarUserFooter({
  user,
  role,
  collapsed = false,
}: {
  user: { name: string };
  role: StaffRole;
  collapsed?: boolean;
}) {
  const roleLabel = ROLE_LABEL_VI[role];

  if (collapsed) {
    return (
      <>
        <Separator className="bg-sidebar-border" />
        <div className="flex flex-col items-center gap-2 p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="size-8 cursor-default ring-2 ring-sidebar-primary/20">
                <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <form action="/api/auth/signout" method="post">
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="touch-target size-8 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                  aria-label="Đăng xuất"
                >
                  <LogOut className="size-4" />
                </Button>
              </form>
            </TooltipTrigger>
            <TooltipContent side="right">Đăng xuất</TooltipContent>
          </Tooltip>
        </div>
      </>
    );
  }

  return (
    <>
      <Separator className="bg-sidebar-border" />
      <div className="flex items-center gap-3 p-4">
        <Avatar className="size-9 ring-2 ring-sidebar-primary/20">
          <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {user.name}
          </p>
          <p className="truncate text-xs font-medium text-sidebar-foreground/45">
            {roleLabel}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="touch-target size-8 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                aria-label="Đăng xuất"
              >
                <LogOut className="size-4" />
              </Button>
            </form>
          </TooltipTrigger>
          <TooltipContent>Đăng xuất</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

/* ─── Admin Workspace Shell ─── */

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<
    "expanded" | "collapsed" | "hover"
  >("expanded");
  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mobileSignOutFormRef = useRef<HTMLFormElement>(null);

  // Restore sidebar mode from cookie
  useEffect(() => {
    const match = document.cookie.match(
      /sidebar_mode=(expanded|collapsed|hover)/,
    );
    const saved = match?.[1];
    if (saved === "expanded" || saved === "collapsed" || saved === "hover") {
      setSidebarMode(saved);
    }
  }, []);

  // Persist mode to cookie + reset hover state when mode changes
  useEffect(() => {
    document.cookie = `sidebar_mode=${sidebarMode};path=/;max-age=${60 * 60 * 24 * 365}`;
    if (sidebarMode !== "hover") setIsHoverOpen(false);
  }, [sidebarMode]);

  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  const isCollapsed =
    sidebarMode === "collapsed" || (sidebarMode === "hover" && !isHoverOpen);

  const handleSidebarMouseEnter = () => {
    if (sidebarMode !== "hover") return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHoverOpen(true), 100);
  };

  const handleSidebarMouseLeave = () => {
    if (sidebarMode !== "hover" || modeMenuOpen) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHoverOpen(false), 300);
  };

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
  const quickLaunchCount = useMemo(
    () => quickLaunchGroups.reduce((total, group) => total + group.items.length, 0),
    [quickLaunchGroups],
  );
  const workspaceLabel = branchId
    ? `Chi nhánh #${branchId}`
    : "Toàn hệ thống";
  const headerBreadcrumb = useMemo(
    () => buildBreadcrumb(pathname, navItems),
    [pathname, navItems],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className={getSurfaceShellClassName("admin", "flex min-h-screen overflow-hidden")}>
        {/* ── Desktop Sidebar spacer (hover mode: keeps layout stable) ── */}
        {sidebarMode === "hover" && (
          <div className="hidden w-16 shrink-0 md:block" />
        )}

        {/* ── Desktop Sidebar (hidden on mobile) ── */}
        <aside
          className={cn(
            getSurfaceSidebarClassName("admin"),
            "hidden flex-col transition-all duration-200 md:flex",
            sidebarMode === "hover"
              ? cn(
                  "fixed inset-y-0 left-0 z-40",
                  isHoverOpen ? "w-64 shadow-xl" : "w-16",
                )
              : isCollapsed
                ? "w-16"
                : "w-64",
          )}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
        >
          {/* Brand */}
          <div
            className={cn(
              "flex h-16 items-center border-b border-sidebar-border/80",
              isCollapsed ? "justify-center px-2" : "gap-3 px-4",
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary shadow-sm shadow-sidebar-primary/15">
              <UtensilsCrossed className="size-5 text-sidebar-primary-foreground" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                  {APP_COPY_VI.erpCockpit}
                </p>
                <span className="text-base font-bold tracking-tight text-sidebar-foreground">
                  Cơm Tấm Má Tư
                </span>
              </div>
            )}
          </div>

          {/* Nav */}
          <ScrollArea
            className={cn("flex-1 py-4", isCollapsed ? "px-2" : "px-3")}
          >
            <SidebarNav
              groups={filteredGroups}
              pathname={pathname}
              collapsed={isCollapsed}
            />
          </ScrollArea>

          {/* Sidebar mode control */}
          <div
            className={cn(
              "flex border-t border-sidebar-border p-2",
              isCollapsed ? "justify-center" : "justify-end",
            )}
          >
            <DropdownMenu
              open={modeMenuOpen}
              onOpenChange={(open) => {
                setModeMenuOpen(open);
                if (!open && sidebarMode === "hover") {
                  clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = setTimeout(
                    () => setIsHoverOpen(false),
                    400,
                  );
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                  aria-label="Chế độ sidebar"
                >
                  {isCollapsed ? (
                    <PanelLeft className="size-4" />
                  ) : (
                    <PanelLeftClose className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isCollapsed ? "right" : "top"}
                align="end"
              >
                <DropdownMenuItem onClick={() => setSidebarMode("expanded")}>
                  <PanelLeft className="size-4" />
                  Mở rộng
                  {sidebarMode === "expanded" && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSidebarMode("collapsed")}>
                  <PanelLeftClose className="size-4" />
                  Thu gọn
                  {sidebarMode === "collapsed" && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSidebarMode("hover")}>
                  <PanelLeft className="size-4" />
                  Mở khi rê chuột
                  {sidebarMode === "hover" && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* User footer — ONLY on desktop sidebar */}
          <SidebarUserFooter user={user} role={role} collapsed={isCollapsed} />
        </aside>

        {/* ── Main Area ── */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <header
            className={getSurfaceHeaderClassName(
              "admin",
              "flex min-h-16 items-center gap-4 px-4 py-3 sm:px-6",
            )}
          >
            {/* Mobile: sidebar toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="touch-target md:hidden"
              aria-label="Mở menu"
              onClick={() => setSheetOpen(true)}
            >
              <Menu className="size-5" />
            </Button>

            {/* Breadcrumb + page title */}
            <div className="min-w-0 flex-1">
              <p className="app-section-label hidden md:block">
                {APP_COPY_VI.adminFoundation}
              </p>
              <nav
                aria-label="Breadcrumb"
                className="hidden items-center gap-1 pt-1 text-xs text-muted-foreground md:flex"
              >
                {headerBreadcrumb.items.map((item, index) => {
                  const isLast = index === headerBreadcrumb.items.length - 1;
                  return (
                    <div
                      key={`${item.label}-${index}`}
                      className="flex items-center gap-1"
                    >
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
                            isLast
                              ? "text-foreground"
                              : "text-muted-foreground",
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

            <div className="hidden md:block">
              <QuickLaunchMenu groups={quickLaunchGroups} />
            </div>

            {/* Mobile only: user avatar with dropdown */}
            <div className="flex items-center gap-1 md:hidden">
              <QuickLaunchMenu groups={quickLaunchGroups} compact />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="touch-target size-8"
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
                  <DropdownMenuItem
                    onSelect={() =>
                      mobileSignOutFormRef.current?.requestSubmit()
                    }
                  >
                    <LogOut className="size-4" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Content */}
          <main id="main-content" className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-screen-2xl flex-col">
              <div className="mb-5 hidden md:block">
                <div className="ui-flow-panel flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4 md:p-5">
                  <div className="min-w-0 space-y-1.5">
                    <p className="app-section-label">Quản trị</p>
                    <h2 className="text-lg font-semibold tracking-tight">
                      {ROLE_LABEL_VI[role]}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StatusBadge
                      tone="info"
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    >
                      Vai trò {ROLE_LABEL_VI[role]}
                    </StatusBadge>
                    <StatusBadge
                      tone="neutral"
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    >
                      {workspaceLabel}
                    </StatusBadge>
                    <StatusBadge
                      tone={quickLaunchCount > 0 ? "success" : "warning"}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    >
                      {navItems.length} mục chính · {quickLaunchCount} truy cập nhanh
                    </StatusBadge>
                  </div>
                </div>
              </div>
              <div>
              {children}
              </div>
            </div>
          </main>
        </div>

        {/* ── Mobile Sheet Sidebar ── */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            className={getSurfaceSidebarClassName("admin", "w-72 p-0")}
          >
            <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
            <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/80 px-4">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-sidebar-primary shadow-sm shadow-sidebar-primary/15">
                <UtensilsCrossed className="size-5 text-sidebar-primary-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                  {APP_COPY_VI.erpCockpit}
                </p>
                <span className="text-base font-bold tracking-tight text-sidebar-foreground">
                  Cơm Tấm Má Tư
                </span>
              </div>
            </div>
            <ScrollArea className="flex-1 px-3 py-4">
              <SidebarNav
                groups={filteredGroups}
                pathname={pathname}
                onNavigate={() => setSheetOpen(false)}
              />
            </ScrollArea>
            <SidebarUserFooter user={user} role={role} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Hidden form for mobile sign-out */}
      <form
        ref={mobileSignOutFormRef}
        action="/api/auth/signout"
        method="post"
        className="hidden"
      />

      {/* Forbidden access notification — Suspense required for useSearchParams */}
      <Suspense fallback={null}>
        <SearchParamBlockedStateFlash mode="toast" autoClear />
      </Suspense>
    </TooltipProvider>
  );
}
