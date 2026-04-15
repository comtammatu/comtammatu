"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ChevronRight,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  ROLE_LABEL_VI,
  resolveAdminNavGroups,
  type ResolvedNavGroup as SharedResolvedNavGroup,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
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

function AdminNav({
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
        <section key={group.title} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
            {group.title}
          </p>
          <div className="space-y-2">
            {group.items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-3xl border px-3 py-3 transition-all",
                    active
                      ? "border-sidebar-primary/35 bg-sidebar-primary text-sidebar-primary-foreground shadow-app-sm"
                      : "border-white/8 bg-white/4 text-sidebar-foreground/70 hover:border-white/12 hover:bg-white/8 hover:text-sidebar-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full border transition-colors",
                      active
                        ? "border-white/12 bg-white/12"
                        : "border-white/10 bg-sidebar-accent text-sidebar-foreground/80",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {item.label}
                  </span>
                  <ChevronRight className="size-4 opacity-60 transition-transform group-hover:translate-x-0.5" />
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
  user,
  role,
  onNavigate,
}: {
  pathname: string;
  groups: ShellNavGroup[];
  user: { name: string };
  role: StaffRole;
  onNavigate?: () => void;
}) {
  return (
    <div className="surface-shell paper-grid-dark flex h-dvh flex-col gap-5 overflow-hidden p-4">
      <div className="rounded-4xl border border-white/10 bg-white/10 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/70">
              <Sparkles className="size-3.5" />
              Nền tảng quản trị
            </div>
            <div className="space-y-2">
              <div className="flex size-14 items-center justify-center rounded-full border border-white/12 bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-sidebar-foreground">
                  Cơm Tấm Má Tư
                </p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-sidebar-foreground/70">
                  Buồng lái dành cho quản trị, báo cáo điều hành và cấu hình hệ
                  thống.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <AdminNav pathname={pathname} groups={groups} onNavigate={onNavigate} />
      </div>

      <div className="rounded-4xl border border-white/10 bg-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full border border-white/12 bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            {getInitials(user.name)}
          </div>
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
              className="touch-target flex items-center justify-center rounded-full border border-white/10 bg-white/8 text-sidebar-foreground/75 transition-colors hover:bg-white/12 hover:text-sidebar-foreground"
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
  branchId: _branchId,
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
  const pageContext = useMemo(
    () => buildContext(pathname, navGroups),
    [navGroups, pathname],
  );

  return (
    <div data-slot="app-shell" className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto min-h-dvh max-w-screen-2xl gap-4 px-3 py-3 xl:flex">
        <aside className="hidden xl:block">
          <div className="sticky top-3">
            <AdminRail pathname={pathname} groups={navGroups} user={user} role={role} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <header className="surface-panel-strong sticky top-3 z-30 overflow-hidden px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="touch-target flex items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground xl:hidden"
                  aria-label="Mở điều hướng"
                >
                  <Menu className="size-5" />
                </button>
                <div className="space-y-2">
                  <p className="ops-kicker">
                    {pageContext.trail.slice(0, -1).join(" · ") ||
                      APP_COPY_VI.adminSurface}
                  </p>
                  <div className="space-y-1">
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                      {pageContext.title}
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Không gian điều phối trung tâm cho nền tảng vận hành nhà
                      hàng.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="ops-chip">{ROLE_LABEL_VI[role]}</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-primary" />
                  {APP_COPY_VI.adminFoundation}
                </span>
              </div>
            </div>
          </header>

          <main id="main-content" className="min-w-0 pb-6">
            <div className="space-y-4">{children}</div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/55 xl:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMobileOpen(false);
              }
            }}
            aria-label="Đóng điều hướng"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm p-3 xl:hidden">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="touch-target absolute right-5 top-5 z-10 flex items-center justify-center rounded-full border border-white/10 bg-white/10 text-sidebar-foreground"
                aria-label="Đóng"
              >
                <X className="size-4" />
              </button>
              <AdminRail
                pathname={pathname}
                groups={navGroups}
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
