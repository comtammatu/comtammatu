import {
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  FileText as IconFileText,
  Package as IconPackage,
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
  showProcurement,
  showProduction,
  showCatalogManagement,
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
      title: "1 · Tồn kho",
      items: [
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: IconPackage,
          matchPrefixes: [
            "/inventory/reports",
            "/inventory/transfers",
            "/inventory/ingredients",
            "/inventory/settings",
            "/inventory/suppliers",
          ],
        },
      ],
    },
  ];

  if (showProcurement) {
    groups.push({
      title: "2 · Nhập hàng",
      items: [
        {
          href: "/inventory/grn",
          label: tNav("grn", "navigation"),
          icon: IconFileText,
          matchPrefixes: [
            "/inventory/grn/",
            "/inventory/operations",
            "/inventory/supplier-invoices",
          ],
        },
      ],
    });
  }

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

  groups.push({
    title: "4 · Kiểm tồn",
    items: [
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: IconClipboardCheck,
      },
      ...(countHref
        ? [
            {
              href: countHref,
              label: "Phân công đếm tồn",
              icon: IconClipboardList,
              matchPrefixes: [
                "/inventory/count-assignments",
                "/inventory/count-slips",
              ],
            },
          ]
        : []),
    ],
  });

  groups.push({
    title: "5 · Tiêu hao",
    items: [
      {
        href: "/inventory/consumption",
        label: tNav("consumption", "navigation"),
        icon: IconFileText,
        matchPrefixes: ["/inventory/issues", "/inventory/waste"],
      },
      ...(showProduction || showProcurement || showCatalogManagement
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

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}
