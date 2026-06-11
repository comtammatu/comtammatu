"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { Separator } from "@comtammatu/ui/components/separator";
import { messages } from "@lib/messages";

const copy = messages.settings.nav;

interface Tab {
  href: string;
  label: string;
  allowedRoles: readonly StaffRole[];
}

const TENANT_STRATEGY_ROLES = [
  "owner",
  "super_manager",
] as const satisfies readonly StaffRole[];

const TABS: Tab[] = [
  {
    href: "/admin/settings/branches",
    label: copy.branches,
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/general",
    label: copy.general,
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/payments",
    label: copy.payments,
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/tables",
    label: copy.tables,
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
  {
    href: "/admin/settings/pos",
    label: copy.pos,
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
  {
    href: "/admin/settings/kds",
    label: copy.kds,
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
  {
    href: "/admin/settings/printers",
    label: copy.printers,
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
];

export function SettingsNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter((tab) => tab.allowedRoles.includes(role));

  return (
    <>
      <nav
        className="flex items-center gap-1 overflow-x-auto"
        aria-label={copy.ariaLabel}
      >
        {visibleTabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex h-9 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Separator />
    </>
  );
}
