"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays as IconCalendarEvent,
  Home as IconHome,
  ListChecks as IconListChecks,
  UserCircle as IconUserCircle,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

const copy = messages.employee.nav;

const NAV_ITEMS = [
  { href: "/employee", label: copy.today, icon: IconHome, exact: true },
  {
    href: "/employee/tasks",
    label: copy.tasks,
    icon: IconListChecks,
    exact: false,
  },
  {
    href: "/employee/schedule",
    label: copy.schedule,
    icon: IconCalendarEvent,
    exact: false,
  },
  {
    href: "/employee/profile",
    label: copy.profileShort,
    icon: IconUserCircle,
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-3 pt-2 shadow-sm chrome-safe-pb backdrop-blur lg:hidden print:hidden"
      aria-label={copy.ariaLabel}
    >
      <div className="no-scrollbar mx-auto flex max-w-lg items-stretch gap-1 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "secondary" : "ghost"}
              size="touch"
              data-active={active ? "true" : undefined}
              className={cn(
                "min-w-0 flex-1 flex-col gap-1 px-1 text-2xs transition-[transform,background-color,color,box-shadow] duration-150 active:translate-y-px",
                active &&
                  "shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
              )}
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

export function EmployeeDesktopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="hidden items-center gap-1 lg:flex"
      aria-label={copy.ariaLabel}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;

        return (
          <Button
            key={item.href}
            asChild
            variant={active ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href={item.href} aria-current={active ? "page" : undefined}>
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
