"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, Home, User } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))]"
      aria-label="Điều hướng chính"
    >
      <div className="mx-auto flex max-w-6xl items-stretch gap-2 px-3 py-3 sm:px-4 lg:px-6">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "default" : "outline"}
              size="sm"
              className="group flex h-auto flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2.5 text-xs shadow-app-sm"
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                <span>{item.label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
