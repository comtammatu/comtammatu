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

  const visibleGroups = NAV_GROUPS.filter(
    (g) => !g.procurementOnly || showProcurement,
  );

  function isActive(href: string) {
    return href === "/admin/inventory"
      ? pathname === "/admin/inventory"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="w-48 shrink-0 self-start">
      <nav aria-label="Kho hàng" className="space-y-5">
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
