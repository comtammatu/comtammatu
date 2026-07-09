import {
  ChartBar as IconChartBar,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  FileCheck as IconFileCheck,
  FileText as IconFileText,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  RotateCcw as IconRotateCcw,
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

// Inventory sidebar nav as data (D019 § D). Role/scope-computed, so it is a
// resolver rather than a static record; it stays in the inventory _lib
// because it reads the inventory dictionary. The shell projects it instead of
// holding a ShellNavGroup[] literal.
export function resolveInventoryNav({
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  showCountAssignments,
  showCountSlips,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  showWasteApprovals: boolean;
  showCountAssignments: boolean;
  showCountSlips: boolean;
}): ShellNavGroup[] {
  const countHref = showCountAssignments
    ? "/inventory/count-assignments"
    : showCountSlips
      ? "/inventory/count-slips"
      : null;
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
      // Cross-branch oversight entries (D061), additive to the branch
      // operator plane at /br/[id]/stock/* — office=oversight, branch=floor.
      {
        href: "/inventory/stock",
        label: tNav("stock", "navigation"),
        icon: IconPackage,
      },
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: IconClipboardCheck,
      },
      ...(countHref
        ? [
            {
              href: countHref,
              label: "Đếm tồn",
              icon: IconClipboardList,
              matchPrefixes: [
                "/inventory/count-assignments",
                "/inventory/count-slips",
              ],
            },
          ]
        : []),
      {
        href: "/inventory/reports",
        label: tNav("reports", "navigation"),
        icon: IconChartBar,
      },
    ],
  });

  groups.push({
    title: "2 · Nhập/Nhận/Đối soát",
    items: [
      {
        href: "/inventory/operations",
        label: "Giao dịch kho",
        icon: IconFileText,
        matchPrefixes: [
          "/inventory/operations",
          "/inventory/purchase-orders",
          "/inventory/grn",
          "/inventory/consumption",
          "/inventory/issues",
          "/inventory/transfers",
        ],
      },
      ...(showProcurement
        ? [
            {
              href: "/inventory/supplier-invoices",
              label: tNav("supplierInvoices", "navigation"),
              icon: IconFileCheck,
            },
            {
              href: "/inventory/supplier-returns",
              label: tNav("supplierReturns", "navigation"),
              icon: IconRotateCcw,
            },
          ]
        : []),
    ],
  });

  if (showProduction) {
    groups.push({
      title: "3 · Sản xuất",
      items: [
        {
          href: "/inventory/production",
          label: "Sản xuất",
          icon: IconToolsKitchen,
          matchPrefixes: ["/inventory/production/new", "/inventory/production/"],
          exact: true,
        },
      ],
    });
  }

  const isBranchManager = userRole === "branch_manager";
  const catalogItems: ShellNavGroup["items"] = [];

  if (!isBranchManager) {
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
  }

  if (showProduction || showProcurement || showCatalogManagement) {
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
