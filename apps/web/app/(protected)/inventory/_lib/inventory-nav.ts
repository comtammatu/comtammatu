import {
  ArrowRightLeft as IconArrowRightLeft,
  CircleMinus as IconCircleMinus,
  ClipboardList as IconClipboardList,
  FileText as IconFileText,
  LayoutDashboard as IconLayoutDashboard,
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

/** D093: PO nav only for owner | accountant. */
function canShowPurchaseOrders(role: StaffRole): boolean {
  return role === "owner" || role === "accountant";
}

/** D093: recipes menu BOM / production recipes — not central_supply. */
function canShowRecipes(
  role: StaffRole,
  showProduction: boolean,
  showCatalogManagement: boolean,
): boolean {
  if (role === "central_supply_ops") return false;
  if (showCatalogManagement) return true;
  if (showProduction && role === "central_kitchen_lead") return true;
  if (role === "owner" && (showProduction || showCatalogManagement)) return true;
  return false;
}

export function resolveInventoryNav({
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  showStockRequestInbox = false,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  showStockRequestInbox?: boolean;
}): ShellNavGroup[] {
  if (userRole === "accountant") {
    return showProcurement
      ? [
          {
            title: "Nhập hàng",
            items: [
              {
                href: "/inventory/grn",
                label: "Nhập kho",
                icon: IconPackagePlus,
              },
              {
                href: "/inventory/purchase-orders",
                label: "Đơn mua hàng",
                icon: IconShoppingCart,
              },
            ],
          },
        ]
      : [];
  }

  const groups: ShellNavGroup[] = [
    {
      title: "0 · Nay",
      items: [
        {
          href: "/inventory",
          label: "Nay",
          icon: IconLayoutDashboard,
          exact: true,
        },
      ],
    },
  ];

  groups.push({
    title: "1 · Kiểm soát tồn",
    items: [
      {
        href: "/inventory/stock",
        label: tNav("stock", "navigation"),
        icon: IconPackage,
      },
    ],
  });

  const inboundItems: ShellNavGroup["items"] = [];
  if (showProcurement) {
    inboundItems.push({
      href: "/inventory/grn",
      label: "Nhập kho",
      icon: IconPackagePlus,
    });
  }
  if (showProcurement && canShowPurchaseOrders(userRole)) {
    inboundItems.push({
      href: "/inventory/purchase-orders",
      label: "Đơn mua hàng",
      icon: IconShoppingCart,
    });
  }
  if (showStockRequestInbox) {
    inboundItems.push({
      href: "/inventory/stock-requests",
      label: "Yêu cầu hàng",
      icon: IconClipboardList,
    });
  }
  inboundItems.push(
    {
      href: "/inventory/consumption",
      label: "Tiêu hao",
      icon: IconCircleMinus,
      matchPrefixes: ["/inventory/consumption/", "/inventory/issues"],
    },
    {
      href: "/inventory/transfers",
      label: "Điều chuyển",
      icon: IconArrowRightLeft,
    },
  );

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
          label: "Sản xuất",
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
  if (showCatalogManagement) {
    catalogItems.push({
      href: "/inventory/ingredients",
      label: tNav("ingredients", "navigation"),
      icon: IconFileText,
    });
  }

  if (canShowRecipes(userRole, showProduction, showCatalogManagement)) {
    catalogItems.push({
      href: "/inventory/recipes",
      label: tNav("recipes", "navigation"),
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
