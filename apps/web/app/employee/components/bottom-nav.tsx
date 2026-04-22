"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, Home, User } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

const NAV_ITEMS = [
  { href: "/employee", label: "Cổng", icon: Home, exact: true },
  {
    href: "/employee/schedule",
    label: "Lịch ca",
    icon: CalendarDays,
    exact: false,
  },
  { href: "/employee/clock", label: "Chấm công", icon: Clock, exact: false },
  { href: "/employee/profile", label: "Cá nhân", icon: User, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pb-2 pt-2 backdrop-blur sm:px-4 lg:hidden"
      aria-label="Điều hướng cổng nhân viên"
    >
      <div className="mx-auto flex max-w-4xl items-stretch gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "default" : "ghost"}
              size="lg"
              className="h-auto flex-1 flex-col gap-1 py-2"
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon data-icon="inline-start" strokeWidth={active ? 2.4 : 2} />
                <span>{item.label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
