"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutGrid,
  LogOut,
  PackageSearch,
  Store,
  Timer,
} from "lucide-react";
import { cn } from "@comtammatu/ui";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavGroup = {
  label: string;
  procurementOnly?: boolean;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "",
    items: [{ href: "/admin/inventory", label: "Tổng quan", icon: LayoutGrid }],
  },
  {
    label: "Vận hành",
    items: [
      {
        href: "/admin/inventory/stocktake",
        label: "Kiểm kê",
        icon: ClipboardCheck,
      },
      { href: "/admin/inventory/expiry", label: "Hạn sử dụng", icon: Timer },
      {
        href: "/admin/inventory/transfers",
        label: "Luân chuyển",
        icon: ArrowLeftRight,
      },
      {
        href: "/admin/inventory/issues",
        label: "Phiếu xuất kho",
        icon: LogOut,
      },
    ],
  },
  {
    label: "Báo cáo",
    items: [
      { href: "/admin/inventory/reports", label: "Báo cáo", icon: BarChart3 },
    ],
  },
  {
    label: "Mua hàng",
    procurementOnly: true,
    items: [
      {
        href: "/admin/inventory/suppliers",
        label: "Nhà cung cấp",
        icon: Store,
      },
      {
        href: "/admin/inventory/purchase-orders",
        label: "Đơn đặt hàng",
        icon: ClipboardList,
      },
      {
        href: "/admin/inventory/grn",
        label: "Phiếu nhập kho",
        icon: PackageSearch,
      },
      {
        href: "/admin/inventory/supplier-invoices",
        label: "Hóa đơn NCC",
        icon: FileText,
      },
      { href: "/admin/inventory/recipes", label: "Công thức", icon: BookOpen },
    ],
  },
];

export function InventorySubNav({
  showProcurement,
}: {
  showProcurement: boolean;
}) {
  const pathname = usePathname();

  const visibleItems = NAV_GROUPS.filter(
    (g) => !g.procurementOnly || showProcurement,
  ).flatMap((g) => g.items);

  function isActive(href: string) {
    return href === "/admin/inventory"
      ? pathname === "/admin/inventory"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="overflow-x-auto border-b scrollbar-none">
      <nav aria-label="Kho hàng" className="flex">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
