"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays as IconCalendarEvent,
  Clock as IconClock,
  CreditCard as IconCreditCard,
  Home as IconHome,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

const copy = messages.employee.nav;

const NAV_ITEMS = [
  { href: "/employee", label: copy.today, icon: IconHome, exact: true },
  {
    href: "/employee/schedule",
    label: copy.schedule,
    icon: IconCalendarEvent,
    exact: false,
  },
  {
    href: "/employee/clock",
    label: copy.clockShort,
    icon: IconClock,
    exact: false,
  },
  {
    href: "/employee/attendance",
    label: copy.attendanceShort,
    icon: IconListChecks,
    exact: false,
  },
  {
    href: "/employee/payslip",
    label: copy.payslipShort,
    icon: IconCreditCard,
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 chrome-safe-pb backdrop-blur sm:px-4 lg:hidden"
      aria-label={copy.ariaLabel}
    >
      <div className="no-scrollbar mx-auto flex max-w-4xl items-stretch gap-1 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "secondary" : "ghost"}
              size="touch"
              className="min-w-14 flex-1 flex-col gap-0.5 px-1 text-2xs sm:min-w-16"
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
