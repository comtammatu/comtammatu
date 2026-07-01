import {
  ChartBar as IconChartBar,
  CheckCircle as IconCheckCircle,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  Factory as IconBuildingFactory,
  FileCheck as IconFileCheck,
  FileText as IconFileText,
  Hourglass as IconHourglass,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  ShoppingCart as IconShoppingCart,
  Truck as IconTruck,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import { type StaffRole } from "@comtammatu/shared/auth";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { tNav } from "./dictionary";

// Inventory sidebar nav as data (D019 § D). Role/scope/siteKind-computed, so it
// is a resolver rather than a static record; it stays in the inventory _lib
// because it reads the inventory dictionary. The shell projects it instead of
// holding a ShellNavGroup[] literal.
export function resolveInventoryNav({
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  showWasteApprovals,
  showCountManagement,
  siteKind,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  showWasteApprovals: boolean;
  showCountManagement: boolean;
  siteKind: string;
}): ShellNavGroup[] {
  const isBranchSite = siteKind === "branch";
  const isBranchManager = userRole === "branch_manager";
  const showBackOffice =
    !isBranchManager && (showSettings || showProcurement || showCatalogManagement);
  const groups: ShellNavGroup[] = [
    {
      title: "Điểm vào",
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
      {
        href: "/inventory/stock",
        label: isBranchSite ? "Tồn cần xử lý" : tNav("stock", "navigation"),
        icon: IconPackage,
      },
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: IconClipboardList,
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
        href: "/inventory/issues",
        label: "Hao hụt/điều chỉnh",
        icon: IconFileText,
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

  if (showProcurement) {
    groups.push({
      title: "2 · Nhập/Nhận/Đối soát",
      items: [
        {
          href: "/inventory/purchase-orders",
          label: tNav("purchaseOrders", "navigation"),
          icon: IconShoppingCart,
        },
        {
          href: "/inventory/grn",
          label: tNav("grn", "navigation"),
          icon: IconReceipt,
        },
        {
          href: "/inventory/supplier-invoices",
          label: tNav("supplierInvoices", "navigation"),
          icon: IconFileCheck,
        },
      ],
    });
  }

  groups.push({
    title: "3 · Điều phối/Sản xuất",
    items: [
      {
        href: "/inventory/transfers",
        label: isBranchSite ? "Nhận/điều chuyển hàng" : "Điều chuyển",
        icon: IconTruck,
      },
      ...(showProduction
        ? [
            {
              href: "/inventory/production",
              label: "Lệnh sản xuất",
              icon: IconBuildingFactory,
            },
          ]
        : []),
    ],
  });

  if (showBackOffice) {
    groups.push({
      title: "Danh mục",
      items: [
        ...(showSettings
          ? [
              {
                href: "/inventory/settings",
                label: tNav("settings", "navigation"),
                icon: IconSettings,
              },
            ]
          : []),
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
