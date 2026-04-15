"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, Home, User } from "lucide-react";
import { cn } from "@comtammatu/ui";

const NAV_ITEMS = [
  { href: "/employee", label: "Trang chủ", icon: Home, exact: true },
  {
    href: "/employee/schedule",
    label: "Lịch ca",
    icon: CalendarDays,
    exact: false,
  },
  {
    href: "/employee/clock",
    label: "Chấm công",
    icon: Clock,
    exact: false,
  },
  {
    href: "/employee/profile",
    label: "Cá nhân",
    icon: User,
    exact: false,
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="safe-bottom-pad fixed inset-x-0 bottom-0 z-40"
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto max-w-6xl px-3 pb-3 sm:px-4 lg:px-6">
        <div className="surface-panel-strong px-2 py-2">
          <div className="grid grid-cols-4 gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-app-sm"
                      : "border border-transparent bg-secondary/55 text-muted-foreground hover:border-border hover:bg-accent/75 hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" strokeWidth={active ? 2.4 : 2} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
