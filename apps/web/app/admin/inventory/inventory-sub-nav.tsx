"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  LayoutGrid,
  Package,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Additional pathname prefixes that should highlight this item */
  alsoMatchPrefixes?: string[];
  /** Only show when user has procurement access */
  procurementOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/inventory",
    label: "Tổng quan",
    icon: LayoutGrid,
  },
  {
    href: "/admin/inventory/stock",
    label: "Tồn kho",
    icon: Package,
    alsoMatchPrefixes: ["/admin/inventory/issues"],
  },
  {
    href: "/admin/inventory/receiving",
    label: "Nhập kho",
    icon: ShoppingCart,
    procurementOnly: true,
    alsoMatchPrefixes: [
      "/admin/inventory/purchase-orders",
      "/admin/inventory/grn",
      "/admin/inventory/supplier-invoices",
    ],
  },
  {
    href: "/admin/inventory/transfers",
    label: "Luân chuyển",
    icon: ArrowLeftRight,
  },
  {
    href: "/admin/inventory/stocktake",
    label: "Kiểm kê",
    icon: ClipboardCheck,
  },
  {
    href: "/admin/inventory/reports",
    label: "Báo cáo",
    icon: BarChart3,
  },
  {
    href: "/admin/inventory/settings",
    label: "Cài đặt",
    icon: Settings,
  },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  // Exact match for root dashboard
  if (item.href === "/admin/inventory") {
    return pathname === "/admin/inventory";
  }
  // Prefix match for the item's own href
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  // Check additional prefixes (e.g., /purchase-orders highlights "Nhập kho")
  if (item.alsoMatchPrefixes) {
    return item.alsoMatchPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return false;
}

export function InventorySubNav({
  showProcurement,
}: {
  showProcurement: boolean;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.procurementOnly || showProcurement,
  );

  const activeItem = visibleItems.find((item) => isItemActive(item, pathname));
  const ActiveIcon = activeItem?.icon ?? LayoutGrid;

  return (
    <>
      {/* Desktop: horizontal tabs */}
      <nav aria-label="Kho hàng" className="hidden border-b md:block">
        <div className="flex gap-0.5 overflow-x-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile: sheet trigger + drawer */}
      <div className="border-b md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full items-center justify-between px-4 py-2.5"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <ActiveIcon className="size-4 shrink-0" aria-hidden="true" />
                {activeItem?.label ?? "Kho hàng"}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-8">
            <SheetHeader>
              <SheetTitle>Kho hàng</SheetTitle>
            </SheetHeader>
            <nav
              aria-label="Kho hàng — mobile"
              className="mt-4 flex flex-col gap-1"
            >
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
