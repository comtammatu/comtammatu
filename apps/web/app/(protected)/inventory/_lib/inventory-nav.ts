import {
  ArrowRightLeft as IconArrowRightLeft,
  CircleMinus as IconCircleMinus,
  FileText as IconFileText,
  Package as IconPackage,
  PackagePlus as IconPackagePlus,
  ShoppingCart as IconShoppingCart,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { tNav } from "./dictionary";

function appendBranchId(href: string, branchId: number): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("branchId", String(branchId));
  return `${path}?${params.toString()}`;
}

export function withInventoryBranchNavScope(
  groups: ShellNavGroup[],
  branchId: number | null,
): ShellNavGroup[] {
  if (branchId == null) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      linkHref: appendBranchId(item.href, branchId),
    })),
  }));
}

/** Soft-hide PO lifecycle nav for central ops and branch managers. */
function canShowPurchaseOrders(role: StaffRole): boolean {
  return role === "owner" || role === "accountant";
}

/** Menu-item consumption recipes are owner-managed catalog data. */
function canShowMenuRecipes(
  role: StaffRole,
  showCatalogManagement: boolean,
): boolean {
  return role === "owner" && showCatalogManagement;
}

export type InventoryNavFlags = {
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  /** Browse `/inventory/ingredients` without write rights. */
  showCatalogRead?: boolean;
  showSettings: boolean;
  showStockRequestInbox?: boolean;
};

export function resolveInventoryNav({
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showCatalogRead = false,
  showSettings,
  showStockRequestInbox = false,
}: InventoryNavFlags & {
  userRole: StaffRole;
}): ShellNavGroup[] {
  if (userRole === "accountant") {
    return showProcurement
      ? [
          {
            title: "Nhập hàng",
            items: [
              {
                href: "/inventory/purchase-orders",
                label: tNav("purchaseOrders", "navigation"),
                icon: IconShoppingCart,
                matchPrefixes: ["/inventory/purchase-requests"],
              },
              {
                href: "/inventory/grn",
                label: tNav("grn", "navigation"),
                icon: IconPackagePlus,
              },
            ],
          },
        ]
      : [];
  }

  const groups: ShellNavGroup[] = [
    {
      title: "1 · Kiểm soát tồn",
      items: [
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: IconPackage,
        },
      ],
    },
  ];

  const inboundItems: ShellNavGroup["items"] = [];
  if (showProcurement && canShowPurchaseOrders(userRole)) {
    inboundItems.push({
      href: "/inventory/purchase-orders",
      label: tNav("purchaseOrders", "navigation"),
      icon: IconShoppingCart,
      matchPrefixes: ["/inventory/purchase-requests"],
    });
  }
  if (showProcurement) {
    inboundItems.push({
      href: "/inventory/grn",
      label: tNav("grn", "navigation"),
      icon: IconPackagePlus,
    });
  }
  inboundItems.push({
    href: "/inventory/consumption",
    label: tNav("consumption", "navigation"),
    icon: IconCircleMinus,
    matchPrefixes: [
      "/inventory/consumption/",
      "/inventory/issues",
      "/inventory/waste",
    ],
  });
  if (showStockRequestInbox || userRole === "owner") {
    inboundItems.push({
      href: "/inventory/transfers",
      label: tNav("transfers", "navigation"),
      icon: IconArrowRightLeft,
      matchPrefixes: ["/inventory/transfers/", "/inventory/stock-requests"],
    });
  }

  groups.push({
    title: "2 · Nhập hàng",
    items: inboundItems,
  });

  if (showProduction) {
    groups.push({
      title: "3 · Sản xuất",
      items: [
        {
          href: "/inventory/production",
          label: tNav("production", "navigation"),
          icon: IconToolsKitchen,
          matchPrefixes: [
            "/inventory/production/new",
            "/inventory/production/",
          ],
          exact: true,
        },
      ],
    });
  }

  const catalogItems: ShellNavGroup["items"] = [];

  if (showSettings) {
    catalogItems.push({
      href: "/inventory/settings",
      label: tNav("settings", "navigation"),
      icon: IconSettings,
      matchPrefixes: ["/inventory/settings/"],
    });
  }
  if (showProcurement) {
    catalogItems.push({
      href: "/inventory/suppliers",
      label: tNav("suppliers", "navigation"),
      icon: IconUsers,
    });
  }
  if (showCatalogManagement || showCatalogRead) {
    catalogItems.push({
      href: "/inventory/ingredients",
      label: tNav("ingredients", "navigation"),
      icon: IconFileText,
    });
  }

  if (canShowMenuRecipes(userRole, showCatalogManagement)) {
    catalogItems.push({
      href: "/inventory/menu-recipes",
      label: tNav("menuRecipes", "navigation"),
      icon: IconToolsKitchen,
    });
  }

  if (catalogItems.length > 0) {
    groups.push({
      title: "4 · Danh mục & thiết lập",
      items: catalogItems,
    });
  }

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}
