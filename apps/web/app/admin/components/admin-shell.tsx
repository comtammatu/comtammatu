"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  MODULE_ACL,
  canAccess,
  ADMIN_NAV_GROUPS,
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

/* ─── Sidebar Navigation (shared between desktop & mobile sheet) ─── */

function SidebarNav({
  groups,
  pathname,
  onNavigate,
}: {
  groups: ResolvedNavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {group.title}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
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
}: {
  user: { name: string };
  role: string;
}) {
  return (
    <>
      <Separator />
      <div className="flex items-center gap-3 p-4">
        <Avatar className="size-8">
          <AvatarFallback className="bg-muted text-xs font-medium">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground">
            {user.name}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/50">{role}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>Đăng xuất</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

/* ─── Admin Shell ─── */

interface AdminShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function AdminShell({ children, user, role }: AdminShellProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const mobileSignOutFormRef = useRef<HTMLFormElement>(null);

  const filteredGroups = resolveNavGroups(role);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen">
        {/* ── Desktop Sidebar (hidden on mobile) ── */}
        <aside className="hidden w-64 flex-col border-r bg-sidebar md:flex">
          {/* Brand */}
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary">
              <UtensilsCrossed className="size-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">
              Cơm Tấm Má Tư
            </span>
          </div>

          {/* Nav */}
          <ScrollArea className="flex-1 px-3 py-4">
            <SidebarNav groups={filteredGroups} pathname={pathname} />
          </ScrollArea>

          {/* User footer — ONLY on desktop sidebar */}
          <SidebarUserFooter user={user} role={role} />
        </aside>

        {/* ── Main Area ── */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
            {/* Mobile: sidebar toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Mở menu"
              onClick={() => setSheetOpen(true)}
            >
              <Menu className="size-5" />
            </Button>

            {/* Breadcrumb area — placeholder, Sprint 1 S1 will build */}
            <div className="flex-1" />

            {/* Mobile only: user avatar with dropdown */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
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
                    <p className="text-xs text-muted-foreground">{role}</p>
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
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>

        {/* ── Mobile Sheet Sidebar ── */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
            <div className="flex h-14 items-center gap-2 border-b px-4">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary">
                <UtensilsCrossed className="size-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sidebar-foreground">
                Cơm Tấm Má Tư
              </span>
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
    </TooltipProvider>
  );
}
