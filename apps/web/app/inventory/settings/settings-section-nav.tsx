"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@comtammatu/shared/auth";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";

interface Tab {
  href: string;
  label: string;
  allowedRoles?: readonly StaffRole[];
}

const TABS: Tab[] = [
  { href: "/inventory/settings/ingredients", label: "Nguyên liệu" },
  {
    href: "/inventory/settings/recipes",
    label: "Công thức",
    allowedRoles: PROCUREMENT_ROLES,
  },
  {
    href: "/inventory/settings/suppliers",
    label: "Nhà cung cấp",
    allowedRoles: PROCUREMENT_ROLES,
  },
  { href: "/inventory/settings/expiry", label: "Hạn sử dụng" },
];

export function SettingsSectionNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter(
    (tab) => !tab.allowedRoles || tab.allowedRoles.includes(role),
  );

  return (
    <nav
      className="flex gap-1"
      style={{
        borderBottom:
          "1px solid color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
      }}
    >
      {visibleTabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative -mb-px px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={
              isActive
                ? {
                    color: "var(--md-primary)",
                    fontWeight: 700,
                    borderBottom: "2px solid var(--md-primary)",
                  }
                : {
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.7,
                    borderBottom: "2px solid transparent",
                  }
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
