"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";
import type { StaffRole } from "@comtammatu/shared/auth";

interface Tab {
  href: string;
  label: string;
  allowedRoles: readonly StaffRole[];
}

const TABS: Tab[] = [
  {
    href: "/admin/settings/branches",
    label: "Chi nhánh",
    allowedRoles: ["owner", "super_manager"],
  },
  {
    href: "/admin/settings/general",
    label: "Chung",
    allowedRoles: ["owner", "super_manager"],
  },
  {
    href: "/admin/settings/areas",
    label: "Khu vực",
    allowedRoles: ["owner", "super_manager"],
  },
  {
    href: "/admin/settings/tables",
    label: "Bàn",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
  },
  {
    href: "/admin/settings/kds",
    label: "Trạm bếp",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
  },
];

export function SettingsNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter((tab) => tab.allowedRoles.includes(role));

  return (
    <nav className="flex gap-1 border-b">
      {visibleTabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
