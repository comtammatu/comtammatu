"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";
import type { StaffRole } from "@comtammatu/shared/auth";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { tRoute } from "../_lib/dictionary";

interface Tab {
  href: string;
  allowedRoles?: readonly StaffRole[];
}

const TABS: Tab[] = [
  { href: "/inventory/settings/ingredients" },
  {
    href: "/inventory/settings/recipes",
    allowedRoles: PROCUREMENT_ROLES,
  },
  {
    href: "/inventory/settings/suppliers",
    allowedRoles: PROCUREMENT_ROLES,
  },
  { href: "/inventory/settings/expiry" },
];

export function SettingsSectionNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter(
    (tab) => !tab.allowedRoles || tab.allowedRoles.includes(role),
  );

  return (
    <nav className="overflow-x-auto pb-1" aria-label="Mục cài đặt kho">
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
              {tRoute(tab.href, "tab")}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
