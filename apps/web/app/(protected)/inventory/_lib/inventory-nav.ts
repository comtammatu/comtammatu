import {
  ArrowRightLeft as IconArrowRightLeft,
  ChartColumn as IconChartColumn,
  CircleMinus as IconCircleMinus,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  FileText as IconFileText,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  PackagePlus as IconPackagePlus,
  Settings as IconSettings,
  Trash2 as IconTrash2,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
  Wallet as IconWallet,
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

// Inventory sidebar nav as data (D019 § D / ADR 0018). Role/scope-computed, so
// it is a resolver rather than a static record; it stays in the inventory _lib
// because it reads the inventory dictionary. The shell projects it instead of
// holding a ShellNavGroup[] literal.
export function resolveInventoryNav({
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
}): ShellNavGroup[] {
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
      // operator plane at /br/[id]/stock/* — owner=oversight, branch=floor.
      {
        href: "/inventory/stock",
        label: tNav("stock", "navigation"),
        icon: IconPackage,
      },
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: IconClipboardList,
      },
      {
        href: "/inventory/count-assignments",
        label: "Phiếu giao đếm",
        icon: IconClipboardCheck,
      },
      {
        href: "/inventory/count-slips",
        label: "Phiếu đếm",
        icon: IconClipboardCheck,
      },
      {
        href: "/inventory/reports",
        label: tNav("reports", "navigation"),
        icon: IconChartColumn,
      },
    ],
  });

  groups.push({
    title: "2 · Nhập/Điều chuyển",
    items: [
      ...(showProcurement
        ? [
            {
              href: "/inventory/grn",
              label: "Nhập kho",
              icon: IconPackagePlus,
            },
          ]
        : []),
      {
        href: "/inventory/transfers",
        label: "Điều chuyển",
        icon: IconArrowRightLeft,
      },
      {
        href: "/inventory/consumption",
        label: "Tiêu hao",
        icon: IconCircleMinus,
        matchPrefixes: ["/inventory/issues"],
      },
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
          matchPrefixes: [
            "/inventory/production/new",
            "/inventory/production/",
          ],
          exact: true,
        },
      ],
    });
  }

  const costItems: ShellNavGroup["items"] = [
    {
      href: "/inventory/waste/approvals",
      label: "Duyệt hao hụt",
      icon: IconTrash2,
      matchPrefixes: ["/inventory/waste/"],
    },
  ];
  if (showProcurement) {
    costItems.push({
      // Finance owns supplier invoices (ADR 0018); Inventory nav deep-links.
      href: "/finance/supplier-invoices",
      label: tNav("supplierInvoices", "navigation"),
      icon: IconWallet,
    });
  }
  groups.push({
    title: "4 · Hao hụt & AP",
    items: costItems,
  });

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
      title: "5 · Danh mục & thiết lập",
      items: catalogItems,
    });
  }

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}
