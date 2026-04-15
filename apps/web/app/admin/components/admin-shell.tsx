"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
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
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
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
import { SearchParamBlockedStateFlash } from "@/components/foundation/blocked-state-flash";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
} from "@/components/v2/shell-primitives";

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

type UiQuickLaunchGroup = {
  title: string;
  items: ResolvedNavItem[];
};

function mapResolvedNavLink(item: ResolvedNavLink): ResolvedNavItem {
  return {
    label: item.label,
    href: item.href,
    icon: ADMIN_ICON_MAP[item.icon] ?? LayoutDashboard,
    moduleKey: item.moduleKey,
  };
}

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

function mapQuickLaunchGroups(
  groups: ReturnType<typeof resolveQuickLaunchGroups>,
): UiQuickLaunchGroup[] {
  return groups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => mapResolvedNavLink(item)),
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
  const trail = [APP_COPY_VI.adminSurface, active.label, ...pathTail];

  return {
    title: trail[trail.length - 1] ?? APP_COPY_VI.adminSurface,
    trail,
  };
}

function QuickLaunchMenu({ groups }: { groups: UiQuickLaunchGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 rounded-full border-border/70 bg-card px-4 shadow-app-sm"
          aria-label={APP_COPY_VI.quickAccessAria}
        >
          <ExternalLink className="size-4" />
          <span className="font-medium">{APP_COPY_VI.quickAccess}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 rounded-3xl border-border/80 p-2"
      >
        {groups.map((group, index) => (
          <div key={group.title}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <div className="px-2 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.href}
                  asChild
                  className="rounded-2xl"
                >
                  <Link href={item.href} className="flex items-center gap-2.5">
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                    <ExternalLink className="ml-auto size-3.5 opacity-60" />
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

function NavSection({
  pathname,
  groups,
  onNavigate,
}: {
  pathname: string;
  groups: ShellNavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
            {group.title}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition-colors",
                    active
                      ? "border-sidebar-primary/40 bg-sidebar-primary text-sidebar-primary-foreground"
                      : "border-transparent bg-transparent text-sidebar-foreground/72 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl border",
                      active
                        ? "border-white/10 bg-white/10"
                        : "border-sidebar-border bg-sidebar-accent/80",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.label}
                  </span>
                  <ChevronRight className="size-4 opacity-60" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AdminRail({
  pathname,
  groups,
  quickLaunchGroups,
  user,
  role,
  onNavigate,
}: {
  pathname: string;
  groups: ShellNavGroup[];
  quickLaunchGroups: UiQuickLaunchGroup[];
  user: { name: string };
  role: StaffRole;
  onNavigate?: () => void;
}) {
  return (
    <div className="surface-shell flex h-full flex-col p-4">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
          Restaurant Ops OS
        </p>
        <div className="mt-3 flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-sidebar-foreground">
              Cơm Tấm Má Tư
            </p>
            <p className="mt-1 text-sm leading-5 text-sidebar-foreground/65">
              Trung tâm điều phối hệ thống và backoffice.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <QuickLaunchMenu groups={quickLaunchGroups} />
      </div>

      <div className="mt-5 flex-1 overflow-y-auto pr-1">
        <NavSection
          pathname={pathname}
          groups={groups}
          onNavigate={onNavigate}
        />
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-11 rounded-2xl border border-white/10">
            <AvatarFallback className="rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {ROLE_LABEL_VI[role]}
            </p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
              aria-label="Đăng xuất"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({
  user,
  role,
  branchId,
  children,
}: {
  user: { name: string };
  role: StaffRole;
  branchId: number | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroups = useMemo(
    () => mapResolvedNavGroups(resolveAdminNavGroups(role)),
    [role],
  );
  const quickLaunchGroups = useMemo(
    () => mapQuickLaunchGroups(resolveQuickLaunchGroups(role, branchId)),
    [branchId, role],
  );
  const pageContext = useMemo(
    () => buildContext(pathname, navGroups),
    [navGroups, pathname],
  );

  return (
    <div className="min-h-dvh bg-background text-foreground md:p-3">
      <div className="mx-auto flex min-h-dvh w-full max-w-screen-2xl gap-3">
        <aside className="hidden w-80 shrink-0 md:block">
          <div className="sticky top-3 h-dvh">
            <AdminRail
              pathname={pathname}
              groups={navGroups}
              quickLaunchGroups={quickLaunchGroups}
              user={user}
              role={role}
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <header className="surface-panel sticky top-0 z-30 px-4 py-4 md:top-3 md:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-panel-subtle text-foreground md:hidden"
                aria-label="Mở điều hướng"
              >
                <Menu className="size-5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {pageContext.trail.slice(0, -1).join(" · ") ||
                    APP_COPY_VI.adminSurface}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {pageContext.title}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {ROLE_LABEL_VI[role]}
                </Badge>
                <div className="hidden sm:block">
                  <QuickLaunchMenu groups={quickLaunchGroups} />
                </div>
              </div>
            </div>
          </header>

          <main id="main-content" className="min-w-0 flex-1 pb-6">
            <div className="space-y-4">
              <Suspense fallback={null}>
                <SearchParamBlockedStateFlash
                  autoClear
                  className="surface-panel p-4"
                  mode="inline"
                />
              </Suspense>
              {children}
            </div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMobileOpen(false);
              }
            }}
            aria-label="Đóng điều hướng"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-80 max-w-full p-3 md:hidden">
            <div className="relative h-full">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-6 top-6 z-10 flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-sidebar-foreground"
                aria-label="Đóng"
              >
                <X className="size-4" />
              </button>
              <AdminRail
                pathname={pathname}
                groups={navGroups}
                quickLaunchGroups={quickLaunchGroups}
                user={user}
                role={role}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
