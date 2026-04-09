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
        "border-t border-border bg-background",
      )}
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0.5rem))",
      }}
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "touch-target flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 text-xs transition-colors",
                active
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
