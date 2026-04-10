"use client";

import { useState } from "react";
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
import { cn } from "@comtammatu/ui";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  alsoMatchPrefixes?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/hr", label: "Tổng quan", icon: Briefcase },
  {
    href: "/hr/employees",
    label: "Nhân viên",
    icon: Users,
    alsoMatchPrefixes: ["/hr/employee"],
  },
  { href: "/hr/shifts", label: "Ca làm việc", icon: CalendarDays },
  {
    href: "/hr/attendance",
    label: "Chấm công",
    icon: ClipboardList,
  },
  {
    href: "/hr/payroll",
    label: "Bảng lương",
    icon: Wallet,
    alsoMatchPrefixes: ["/hr/payroll/"],
  },
  { href: "/hr/reports", label: "Báo cáo", icon: BarChart3 },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/hr") return pathname === "/hr";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`))
    return true;
  return (
    item.alsoMatchPrefixes?.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    ) ?? false
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase();
}

function NavContent({
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
    <div className="flex h-full flex-col">
      {/* Back to admin + brand */}
      <div className="p-6 pb-4">
        <Link
          href="/admin/dashboard"
          onClick={onNavigate}
          className="mb-6 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Quản lý
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Briefcase className="size-4.5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-foreground">
              Nhân sự & Lương
            </p>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              HR & Payroll
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-white/60 text-primary"
                    : "text-foreground/60 hover:bg-white/40 hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute right-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-l-full bg-primary" />
                )}
                <Icon
                  className={cn(
                    "size-4.5 shrink-0",
                    active ? "text-primary" : "text-foreground/40",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User footer */}
      <div className="mt-auto border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_LABEL_VI[role]}
            </p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
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
  children: React.ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function HRShell({ children, user, role }: HRShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <NavContent pathname={pathname} role={role} user={user} />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Mở menu"
          >
            <Menu className="size-5" />
          </button>

          <div className="flex-1" />

          {/* Back to admin (desktop) */}
          <Link
            href="/admin/dashboard"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          >
            <ArrowLeft className="size-3.5" />
            Quản lý
          </Link>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</main>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setMobileOpen(false)}
            aria-label="Đóng menu"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar shadow-2xl md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/60"
              aria-label="Đóng"
            >
              <X className="size-4.5" />
            </button>
            <NavContent
              pathname={pathname}
              role={role}
              user={user}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </div>
  );
}
