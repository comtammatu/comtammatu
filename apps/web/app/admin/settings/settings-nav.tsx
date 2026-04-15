"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";

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
    label: "Chi nhánh",
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/general",
    label: "Chung",
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/payments",
    label: "Thanh toán",
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/areas",
    label: "Khu vực",
    allowedRoles: TENANT_STRATEGY_ROLES,
  },
  {
    href: "/admin/settings/tables",
    label: "Bàn",
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
  {
    href: "/admin/settings/pos",
    label: "POS",
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
  {
    href: "/admin/settings/kds",
    label: "Trạm bếp",
    allowedRoles: BRANCH_FLOOR_SETTINGS_ROLES,
  },
];

export function SettingsNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter((tab) => tab.allowedRoles.includes(role));

  return (
    <nav className="overflow-x-auto pb-1" aria-label="Mục cài đặt quản trị">
      <div className="flex min-w-max items-center gap-2 border-b border-border/40 pb-2">
        {visibleTabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "ui-tab-pill focus-ring-standard relative -mb-2 inline-flex min-h-11 items-center rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-150",
                isActive
                  ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                  : "border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/70 hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
