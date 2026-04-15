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
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "ui-safe-bottom border-t bg-background",
      )}
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto flex max-w-6xl items-stretch px-2 py-2 sm:px-4 lg:px-6">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "touch-target-lg focus-ring-standard flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 text-xs transition-all",
                active
                  ? "bg-accent font-semibold text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
