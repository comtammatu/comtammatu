"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { SUPPLIER_RETURN_ROLES, type StaffRole } from "@comtammatu/shared/auth";
import { isNavItemActive } from "@/lib/shell-primitives";
import { tRoute } from "../_lib/dictionary";

interface Tab {
  href: string;
  allowedRoles?: readonly StaffRole[];
}

const TABS: Tab[] = [
  { href: "/inventory/settings/expiry" },
  { href: "/inventory/settings/thresholds" },
  { href: "/inventory/settings/qc", allowedRoles: SUPPLIER_RETURN_ROLES },
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
          const isActive = isNavItemActive({ href: tab.href }, pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative -mb-2 inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/20"
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
