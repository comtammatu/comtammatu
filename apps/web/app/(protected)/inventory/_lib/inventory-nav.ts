import {
  ChartBar as IconChartBar,
  CheckCircle as IconCheckCircle,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  FileCheck as IconFileCheck,
  FileText as IconFileText,
  Hourglass as IconHourglass,
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

// Inventory sidebar nav as data (D019 § D). Role/scope-computed, so it is a
// resolver rather than a static record; it stays in the inventory _lib
// because it reads the inventory dictionary. The shell projects it instead of
// holding a ShellNavGroup[] literal.
export function resolveInventoryNav({
  userRole,
  showProcurement,
  showProduction: _showProduction,
  showCatalogManagement,
  showSettings,
  showWasteApprovals,
  showCountManagement,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  showWasteApprovals: boolean;
  showCountManagement: boolean;
}): ShellNavGroup[] {
  const isBranchManager = userRole === "branch_manager";
  const showBackOffice =
    !isBranchManager && (showSettings || showProcurement || showCatalogManagement);
  const groups: ShellNavGroup[] = [
    {
      title: "0 · Hôm nay",
      items: [
        {
          href: "/inventory",
          label: "Hôm nay",
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
      ...(showCountManagement
        ? [
            {
              href: "/inventory/count-assignments",
              label: "Phân công đếm tồn",
              icon: IconClipboardList,
            },
            {
              href: "/inventory/count-slips",
              label: "Duyệt phiếu đếm tồn",
              icon: IconClipboardCheck,
            },
          ]
        : []),
      {
        href: "/inventory/expiry",
        label: tNav("expiry", "navigation"),
        icon: IconHourglass,
      },
      {
        href: "/inventory/consumption",
        label: "Tiêu hao",
        icon: IconToolsKitchen,
      },
      ...(showWasteApprovals
        ? [
            {
              href: "/inventory/waste/approvals",
              label: "Duyệt hao hụt",
              icon: IconCheckCircle,
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
    title: "2 · Vận hành & Đối soát",
    items: [
      {
        href: "/inventory/operations",
        label: "Giao dịch kho",
        icon: IconFileText,
        matchPrefixes: ["/inventory/operations"],
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

  if (showBackOffice) {
    const settingsItems: ShellNavGroup["items"] = showSettings
      ? [
          {
            href: "/inventory/settings",
            label: tNav("settings", "navigation"),
            icon: IconSettings,
            matchPrefixes: ["/inventory/settings/"],
          },
        ]
      : [];

    groups.push({
      title: "4 · Danh mục & thiết lập",
      items: [
        ...settingsItems,
        ...(showProcurement
          ? [
              {
                href: "/inventory/suppliers",
                label: tNav("suppliers", "navigation"),
                icon: IconUsers,
              },
            ]
          : []),
        ...(showCatalogManagement
          ? [
              {
                href: "/inventory/ingredients",
                label: tNav("ingredients", "navigation"),
                icon: IconFileText,
              },
            ]
          : []),
        ...(showProcurement
          ? [
              {
                href: "/inventory/recipes",
                label: tNav("recipes", "navigation"),
                icon: IconToolsKitchen,
              },
            ]
          : []),
      ],
    });
  }

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}
