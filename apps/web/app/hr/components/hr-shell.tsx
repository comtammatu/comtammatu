"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  LogOut,
  Menu,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";

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
  if (!active) {
    return "Tổng quan";
  }

  const pathTail = pathname
    .slice(active.href.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => formatPathSegment(segment));

  return pathTail[pathTail.length - 1] ?? active.label;
}

function HRRail({
  pathname,
  role,
  user,
  onNavigate,
}: {
  pathname: string;
  role: StaffRole;
  user: { name: string };
  onNavigate?: () => void;
}) {
  return (
    <div className="surface-shell paper-grid-dark flex h-dvh flex-col gap-5 overflow-hidden p-4">
      <div className="rounded-4xl border border-white/10 bg-white/10 p-5">
        <Link
          href="/admin/dashboard"
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Quản trị
        </Link>

        <div className="mt-4 space-y-3">
          <div className="flex size-14 items-center justify-center rounded-full border border-white/12 bg-sidebar-primary text-sidebar-primary-foreground">
            <Briefcase className="size-6" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-sidebar-foreground">
              {APP_COPY_VI.hrWorkspace}
            </p>
            <p className="mt-2 text-sm leading-6 text-sidebar-foreground/70">
              Không gian điều phối lịch, chấm công và bảng lương theo nhịp vận
              hành thực tế.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {NAV_GROUPS.map((group) => (
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
                        : "border-white/8 bg-white/4 text-sidebar-foreground/72 hover:border-white/12 hover:bg-white/8 hover:text-sidebar-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-11 items-center justify-center rounded-full border",
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
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
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

export interface HRShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function HRShell({ children, user, role }: HRShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = useMemo(() => resolveTitle(pathname), [pathname]);

  return (
    <div data-slot="app-shell" className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto min-h-dvh max-w-screen-2xl gap-4 px-3 py-3 xl:flex">
        <aside className="hidden xl:block">
          <div className="sticky top-3">
            <HRRail pathname={pathname} role={role} user={user} />
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
                  <p className="ops-kicker">{APP_COPY_VI.hrWorkspaceSubtitle}</p>
                  <div className="space-y-1">
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                      {pageTitle}
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Theo dõi lực lượng vận hành, phân ca và bảng lương trong
                      một dòng chảy thống nhất.
                    </p>
                  </div>
                </div>
              </div>

              <span className="ops-chip">{ROLE_LABEL_VI[role]}</span>
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
              <HRRail
                pathname={pathname}
                role={role}
                user={user}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
