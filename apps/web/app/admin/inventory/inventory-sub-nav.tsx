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
  PackageSearch,
  Store,
  Timer,
} from "lucide-react";
import { cn } from "@comtammatu/ui";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  procurementOnly?: boolean;
};

const LINKS: NavItem[] = [
  {
    href: "/admin/inventory",
    label: "Tổng quan",
    icon: LayoutGrid,
  },
  {
    href: "/admin/inventory/stocktake",
    label: "Kiểm kê",
    icon: ClipboardCheck,
  },
  {
    href: "/admin/inventory/expiry",
    label: "Hạn sử dụng",
    icon: Timer,
  },
  {
    href: "/admin/inventory/reports",
    label: "Báo cáo",
    icon: BarChart3,
  },
  {
    href: "/admin/inventory/transfers",
    label: "Luân chuyển",
    icon: ArrowLeftRight,
  },
  {
    href: "/admin/inventory/suppliers",
    label: "Nhà cung cấp",
    icon: Store,
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/purchase-orders",
    label: "Đơn đặt hàng",
    icon: ClipboardList,
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/grn",
    label: "Phiếu nhập kho",
    icon: PackageSearch,
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/supplier-invoices",
    label: "Hóa đơn NCC",
    icon: FileText,
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/recipes",
    label: "Công thức",
    icon: BookOpen,
    procurementOnly: true,
  },
] as const;

export function InventorySubNav({
  showProcurement,
}: {
  showProcurement: boolean;
}) {
  const pathname = usePathname();

  const visible = LINKS.filter(
    (link) => !link.procurementOnly || showProcurement,
  );

  return (
    <nav
      className="flex gap-0.5 overflow-x-auto border-b"
      aria-label="Kho hàng"
    >
      {visible.map((link) => {
        const Icon = link.icon;
        const active =
          link.href === "/admin/inventory"
            ? pathname === "/admin/inventory"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors rounded-t-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              active
                ? [
                    "text-primary",
                    "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5",
                    "after:bg-primary after:rounded-t-sm",
                  ]
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="shrink-0">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
