"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";

const TABS = [
  { href: "/admin/settings/branches", label: "Chi nhánh" },
  { href: "/admin/settings/general", label: "Chung" },
  { href: "/admin/settings/tables", label: "Bàn" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
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
