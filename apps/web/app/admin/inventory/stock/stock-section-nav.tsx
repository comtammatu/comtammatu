"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";

const TABS = [
  { href: "/admin/inventory/stock", label: "Tồn kho" },
  { href: "/admin/inventory/stock/issues", label: "Phiếu xuất kho" },
] as const;

export function StockSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-0.5 border-b">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/admin/inventory/stock"
            ? pathname === "/admin/inventory/stock"
            : pathname.startsWith(tab.href);
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
