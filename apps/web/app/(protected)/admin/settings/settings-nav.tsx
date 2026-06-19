"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { messages } from "@lib/messages";
import { isNavItemActive } from "@/lib/shell-primitives";

const copy = messages.settings.nav;

interface Tab {
  href: string;
  label: string;
  allowedRoles: readonly StaffRole[];
}

const TENANT_STRATEGY_ROLES = [
  "owner",
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
    href: "/admin/settings/printers",
    label: copy.printers,
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
];

export function SettingsNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter((tab) => tab.allowedRoles.includes(role));
  const activeTab =
    visibleTabs.find((tab) => isNavItemActive({ href: tab.href }, pathname))
      ?.href ?? visibleTabs[0]?.href;

  if (!activeTab) return null;

  return (
    <nav aria-label={copy.ariaLabel}>
      <Tabs value={activeTab} className="w-full">
        <TabsList variant="toolbar" className="w-full">
          {visibleTabs.map((tab) => {
            const isActive = isNavItemActive({ href: tab.href }, pathname);
            return (
              <TabsTrigger
                key={tab.href}
                value={tab.href}
                asChild
                className="flex-none px-3"
              >
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </nav>
  );
}
