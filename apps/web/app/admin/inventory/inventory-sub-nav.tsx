"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";

const LINKS = [
  { href: "/admin/inventory", label: "Tồn kho & NL" },
  { href: "/admin/inventory/suppliers", label: "Nhà cung cấp" },
  { href: "/admin/inventory/purchase-orders", label: "Đặt hàng (PO)" },
  { href: "/admin/inventory/grn", label: "Nhập kho (GRN)" },
  { href: "/admin/inventory/transfers", label: "Luân chuyển" },
  { href: "/admin/inventory/supplier-invoices", label: "HĐ NCC" },
  { href: "/admin/inventory/recipes", label: "Công thức" },
] as const;

export function InventorySubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Kho hàng">
      {LINKS.map((link) => {
        const active =
          link.href === "/admin/inventory"
            ? pathname === "/admin/inventory"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
