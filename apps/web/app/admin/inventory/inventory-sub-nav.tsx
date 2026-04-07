"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";

const LINKS = [
  { href: "/admin/inventory", label: "Tồn kho & NL", procurementOnly: false },
  {
    href: "/admin/inventory/suppliers",
    label: "Nhà cung cấp",
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/purchase-orders",
    label: "Đặt hàng (PO)",
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/grn",
    label: "Nhập kho (GRN)",
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/transfers",
    label: "Luân chuyển",
    procurementOnly: false,
  },
  {
    href: "/admin/inventory/supplier-invoices",
    label: "HĐ NCC",
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/recipes",
    label: "Công thức",
    procurementOnly: true,
  },
  {
    href: "/admin/inventory/branch-ingredients",
    label: "Mở NL theo CN",
    procurementOnly: false,
    branchIngredientsOnly: true,
  },
] as const;

export function InventorySubNav({
  showProcurement,
  showBranchIngredientSettings,
}: {
  showProcurement: boolean;
  showBranchIngredientSettings: boolean;
}) {
  const pathname = usePathname();
  const visible = LINKS.filter((link) => {
    if ("branchIngredientsOnly" in link && link.branchIngredientsOnly) {
      return showBranchIngredientSettings;
    }
    return !link.procurementOnly || showProcurement;
  });

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Kho hàng">
      {visible.map((link) => {
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
