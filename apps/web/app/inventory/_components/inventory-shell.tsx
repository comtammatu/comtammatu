"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  Hourglass,
  LayoutDashboard,
  Package,
  PackageOpen,
  Receipt,
  ShoppingCart,
  Store,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  canAccess,
  ROLE_LABEL_VI,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@comtammatu/ui/components/sidebar";
import {
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { tNav } from "../_lib/dictionary";

interface InventoryShellProps {
  children: ReactNode;
  user: { name: string };
  userRole: StaffRole;
  siteName: string;
  siteKind: string;
}

function buildInventoryGroups({
  showProcurement,
  userRole,
  siteKind,
}: {
  showProcurement: boolean;
  userRole: StaffRole;
  siteKind: string;
}): ShellNavGroup[] {
  const isBranchSite = siteKind === "branch";
  const issueLabel = isBranchSite ? "Cấp bếp" : "Xuất kho";
  const groups: ShellNavGroup[] = [
    {
      title: "Hôm nay",
      items: [
        { href: "/inventory", label: "Tổng quan", icon: LayoutDashboard },
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: Package,
        },
      ],
    },
  ];

  if (showProcurement) {
    groups.push({
      title: "Nhập hàng HQ",
      items: [
        {
          href: "/inventory/receiving",
          label: tNav("receiving", "navigation"),
          icon: ArrowDownToLine,
        },
        {
          href: "/inventory/purchase-orders",
          label: tNav("purchaseOrders", "navigation"),
          icon: ShoppingCart,
        },
        {
          href: "/inventory/grn",
          label: tNav("grn", "navigation"),
          icon: Receipt,
        },
        {
          href: "/inventory/supplier-invoices",
          label: tNav("supplierInvoices", "navigation"),
          icon: FileText,
        },
      ],
    });
  }

  groups.push({
    title: "Điều chuyển nội bộ",
    items: [
      {
        href: "/inventory/transfers",
        label: tNav("transfers", "navigation"),
        icon: Truck,
      },
    ],
  });

  groups.push({
    title: isBranchSite ? "Vận hành chi nhánh" : "Tồn và xuất",
    items: [
      { href: "/inventory/issues", label: issueLabel, icon: PackageOpen },
    ],
  });

  if (userRole === "super_manager") {
    groups.push({
      title: "Bếp trung tâm",
      items: [
        {
          href: "/inventory/production",
          label: tNav("production", "navigation"),
          icon: Factory,
        },
      ],
    });
  }

  groups.push({
    title: "Kiểm soát",
    items: [
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: ClipboardList,
      },
      {
        href: "/inventory/expiry",
        label: tNav("expiry", "navigation"),
        icon: Hourglass,
      },
      {
        href: "/inventory/reports",
        label: tNav("reports", "navigation"),
        icon: BarChart3,
      },
    ],
  });

  groups.push({
    title: "Danh mục",
    items: [
      {
        href: "/inventory/ingredients",
        label: tNav("ingredients", "navigation"),
        icon: FileText,
      },
      ...(showProcurement
        ? [
            {
              href: "/inventory/suppliers",
              label: tNav("suppliers", "navigation"),
              icon: Users,
            },
            {
              href: "/inventory/recipes",
              label: tNav("recipes", "navigation"),
              icon: UtensilsCrossed,
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

export function InventoryShell({
  children,
  user,
  userRole,
  siteName,
  siteKind,
}: InventoryShellProps) {
  const pathname = usePathname();
  const showProcurement = canAccess(userRole, "inventory_procurement");
  const groups = useMemo(
    () => buildInventoryGroups({ showProcurement, userRole, siteKind }),
    [showProcurement, siteKind, userRole],
  );

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              MT
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Cơm Tấm Má Tư</span>
              <span className="text-xs text-muted-foreground">Quản lý kho</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2 py-1.5 text-sm">
            <Store className="size-4" />
            <div className="flex flex-1 flex-col">
              <span className="text-xs font-medium">{siteName}</span>
              <span className="text-xs text-muted-foreground">
                {getInventorySiteKindLabelVi(siteKind)}
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL_VI[userRole]}
              </p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex flex-col">{children}</SidebarInset>
    </SidebarProvider>
  );
}
