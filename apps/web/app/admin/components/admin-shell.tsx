"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ChefHat,
  ChevronRight,
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
import { toast } from "sonner";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  MODULE_ACL,
  canAccess,
  ADMIN_NAV_GROUPS,
  ROLE_LABEL_VI,
} from "@comtammatu/shared/auth";
import type { ModuleKey } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
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

/* ─── Icon registry (Lucide name → component) ─── */

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  UtensilsCrossed,
  Receipt,
  Package,
  Users,
  Heart,
  Briefcase,
  Wallet,
  BarChart3,
  Settings,
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

interface ResolvedNavGroup {
  title: string;
  items: ResolvedNavItem[];
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

function resolveNavGroups(role: StaffRole): ResolvedNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => canAccess(role, item.moduleKey))
      .map((item) => {
        const acl = MODULE_ACL[item.moduleKey];
        return {
          label: acl.label,
          href: acl.path,
          icon: ICON_MAP[item.icon] ?? LayoutDashboard,
          moduleKey: item.moduleKey,
        };
      }),
  })).filter((group) => group.items.length > 0);
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
      title: "Admin",
      items: [{ label: "Admin", href: "/admin/dashboard" }],
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
    { label: "Admin", href: "/admin/dashboard" },
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

/* ─── Forbidden toast (Suspense boundary required for useSearchParams) ─── */

function ForbiddenToastInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const shown = useRef(false);

  useEffect(() => {
    if (!shown.current && searchParams.get("forbidden") === "1") {
      shown.current = true;
      toast.error("Bạn không có quyền truy cập trang đó");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("forbidden");
      const qs = params.toString();
      router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
    }
  }, []); // intentional: check forbidden param only on mount

  return null;
}

/* ─── Branch operational shortcuts (POS + KDS) for branch_manager ─── */

function BranchOperationsNav({
  branchId,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  branchId: number;
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const items = [
    { href: `/br/${branchId}/pos`, label: "POS", icon: Monitor },
    { href: `/br/${branchId}/kds`, label: "Bếp (KDS)", icon: ChefHat },
  ];

  return (
    <div
      className={cn(
        "mt-2 border-t border-sidebar-border",
        collapsed ? "pt-3" : "pt-4",
      )}
    >
      {!collapsed && (
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          Vận hành ca
        </p>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
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

/* ─── Admin Shell ─── */

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileSignOutFormRef = useRef<HTMLFormElement>(null);

  const filteredGroups = resolveNavGroups(role);
  const navItems = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );
  const headerBreadcrumb = useMemo(
    () => buildBreadcrumb(pathname, navItems),
    [pathname, navItems],
  );

  const showBranchOps = role === "branch_manager" && branchId != null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden">
        {/* ── Desktop Sidebar (hidden on mobile) ── */}
        <aside
          className={cn(
            "hidden flex-col border-r bg-sidebar transition-all duration-200 md:flex",
            sidebarCollapsed ? "w-16" : "w-64",
          )}
        >
          {/* Brand */}
          <div
            className={cn(
              "flex h-14 items-center border-b border-sidebar-border",
              sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4",
            )}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary shadow-sm">
              <UtensilsCrossed className="size-5 text-sidebar-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <span className="text-base font-bold tracking-tight text-sidebar-foreground">
                  Cơm Tấm Má Tư
                </span>
                <p className="text-xs font-medium uppercase tracking-widest text-sidebar-foreground/40">
                  Quản lý
                </p>
              </div>
            )}
          </div>

          {/* Nav */}
          <ScrollArea
            className={cn("flex-1 py-4", sidebarCollapsed ? "px-2" : "px-3")}
          >
            <SidebarNav
              groups={filteredGroups}
              pathname={pathname}
              collapsed={sidebarCollapsed}
            />
            {showBranchOps && (
              <BranchOperationsNav
                branchId={branchId}
                pathname={pathname}
                collapsed={sidebarCollapsed}
              />
            )}
          </ScrollArea>

          {/* Collapse toggle */}
          <div
            className={cn(
              "flex border-t border-sidebar-border p-2",
              sidebarCollapsed ? "justify-center" : "justify-end",
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  className="size-8 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                  aria-label={
                    sidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"
                  }
                >
                  {sidebarCollapsed ? (
                    <PanelLeft className="size-4" />
                  ) : (
                    <PanelLeftClose className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={sidebarCollapsed ? "right" : "top"}>
                {sidebarCollapsed ? "Mở rộng" : "Thu gọn"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* User footer — ONLY on desktop sidebar */}
          <SidebarUserFooter
            user={user}
            role={role}
            collapsed={sidebarCollapsed}
          />
        </aside>

        {/* ── Main Area ── */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
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
              <nav
                aria-label="Breadcrumb"
                className="hidden items-center gap-1 text-xs text-muted-foreground md:flex"
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

            {/* Mobile only: user avatar with dropdown */}
            <div className="md:hidden">
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
          <main id="main-content" className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>

        {/* ── Mobile Sheet Sidebar ── */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
            <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
              <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary shadow-sm">
                <UtensilsCrossed className="size-5 text-sidebar-primary-foreground" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight text-sidebar-foreground">
                  Cơm Tấm Má Tư
                </span>
                <p className="text-xs font-medium uppercase tracking-widest text-sidebar-foreground/40">
                  Quản lý
                </p>
              </div>
            </div>
            <ScrollArea className="flex-1 px-3 py-4">
              <SidebarNav
                groups={filteredGroups}
                pathname={pathname}
                onNavigate={() => setSheetOpen(false)}
              />
              {showBranchOps && (
                <BranchOperationsNav
                  branchId={branchId}
                  pathname={pathname}
                  onNavigate={() => setSheetOpen(false)}
                />
              )}
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
        <ForbiddenToastInner />
      </Suspense>
    </TooltipProvider>
  );
}
