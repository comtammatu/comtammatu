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
} from "@/components/v2/shell-primitives";

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
    <div className="surface-shell flex h-full flex-col p-4">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <Link
          href="/admin/dashboard"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55"
        >
          <ArrowLeft className="size-3.5" />
          Quản lý
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-sidebar-primary text-sidebar-primary-foreground">
            <Briefcase className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-sidebar-foreground">
              {APP_COPY_VI.hrWorkspace}
            </p>
            <p className="mt-1 text-sm leading-6 text-sidebar-foreground/65">
              Điều phối lịch, chấm công và bảng lương trong cùng một mặt điều
              khiển.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto pr-1">
        <div className="space-y-6">
          {NAV_GROUPS.map((group) => (
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
                          : "border-transparent text-sidebar-foreground/72 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
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
                      <span className="flex-1 truncate font-medium">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
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
    <div className="min-h-dvh bg-background text-foreground md:p-3">
      <div className="mx-auto flex min-h-dvh w-full max-w-screen-2xl gap-3">
        <aside className="hidden w-80 shrink-0 md:block">
          <div className="sticky top-3 h-dvh">
            <HRRail pathname={pathname} role={role} user={user} />
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
                  {APP_COPY_VI.hrWorkspaceSubtitle}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {pageTitle}
                </h1>
              </div>
            </div>
          </header>

          <main
            id="main-content"
            className="min-w-0 flex-1 overflow-y-auto pb-6"
          >
            <div className="space-y-4">{children}</div>
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
