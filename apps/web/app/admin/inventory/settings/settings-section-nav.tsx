"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";
import type { StaffRole } from "@comtammatu/shared/auth";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";

interface Tab {
  href: string;
  label: string;
  allowedRoles?: readonly StaffRole[];
}

const TABS: Tab[] = [
  { href: "/admin/inventory/settings/ingredients", label: "Nguyên liệu" },
  {
    href: "/admin/inventory/settings/recipes",
    label: "Công thức",
    allowedRoles: PROCUREMENT_ROLES,
  },
  {
    href: "/admin/inventory/settings/suppliers",
    label: "Nhà cung cấp",
    allowedRoles: PROCUREMENT_ROLES,
  },
  { href: "/admin/inventory/settings/expiry", label: "Hạn sử dụng" },
];

export function SettingsSectionNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter(
    (tab) => !tab.allowedRoles || tab.allowedRoles.includes(role),
  );

  return (
    <nav className="flex gap-0.5 border-b">
      {visibleTabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative -mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
