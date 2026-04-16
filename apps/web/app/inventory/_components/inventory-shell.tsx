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
  MapPin,
  Package,
  PackageOpen,
  PackagePlus,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { canAccess, ROLE_LABEL_VI, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { tNav, tRoute } from "../_lib/dictionary";
import { WorkspaceShell } from "@/components/workspace-shell";

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
        { href: "/inventory", label: "Bảng điều phối", icon: LayoutDashboard },
      ],
    },
  ];

  if (showProcurement) {
    groups.push({
      title: "Nhập hàng HQ",
      items: [
        { href: "/inventory/receiving", label: tNav("receiving", "navigation"), icon: ArrowDownToLine },
        { href: "/inventory/purchase-orders", label: tNav("purchaseOrders", "navigation"), icon: ShoppingCart },
        { href: "/inventory/grn", label: tNav("grn", "navigation"), icon: Receipt },
        { href: "/inventory/supplier-invoices", label: tNav("supplierInvoices", "navigation"), icon: FileText },
      ],
    });
  }

  groups.push({
    title: "Điều chuyển nội bộ",
    items: [
      { href: "/inventory/transfers", label: tNav("transfers", "navigation"), icon: Truck },
    ],
  });

  groups.push({
    title: isBranchSite ? "Vận hành chi nhánh" : "Tồn và xuất",
    items: [
      { href: "/inventory/stock", label: tNav("stock", "navigation"), icon: Package },
      { href: "/inventory/issues", label: issueLabel, icon: PackageOpen },
    ],
  });

  if (userRole === "super_manager") {
    groups.push({
      title: "Bếp trung tâm",
      items: [
        { href: "/inventory/production", label: tNav("production", "navigation"), icon: Factory },
      ],
    });
  }

  groups.push({
    title: "Kiểm soát",
    items: [
      { href: "/inventory/stocktake", label: tNav("stocktake", "navigation"), icon: ClipboardList },
      { href: "/inventory/expiry", label: tNav("expiry", "navigation"), icon: Hourglass },
      { href: "/inventory/reports", label: tNav("reports", "navigation"), icon: BarChart3 },
    ],
  });

  groups.push({
    title: "Danh mục",
    items: [
      { href: "/inventory/ingredients", label: tNav("ingredients", "navigation"), icon: FileText },
      ...(showProcurement
        ? [
            { href: "/inventory/suppliers", label: tNav("suppliers", "navigation"), icon: Users },
            { href: "/inventory/recipes", label: tNav("recipes", "navigation"), icon: UtensilsCrossed },
          ]
        : []),
    ],
  });

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}

function resolveContext(pathname: string, groups: ShellNavGroup[]) {
  const directLabel = tRoute(pathname, "heading");
  if (directLabel !== pathname) {
    const active = findActiveNavItem(groups, pathname);
    return { title: directLabel, eyebrow: active?.label ?? "Kho vận" };
  }

  const active = findActiveNavItem(groups, pathname);
  const pathTail = active
    ? pathname
        .slice(active.href.length)
        .split("/")
        .filter(Boolean)
        .map((segment) => formatPathSegment(segment))
    : [];

  return {
    title: pathTail[pathTail.length - 1] ?? active?.label ?? "Tổng quan",
    eyebrow: active?.label ?? "Kho vận",
  };
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
    () =>
      buildInventoryGroups({
        showProcurement,
        userRole,
        siteKind,
      }),
    [showProcurement, siteKind, userRole],
  );
  const pageContext = useMemo(
    () => resolveContext(pathname, groups),
    [groups, pathname],
  );

  return (
    <WorkspaceShell
      pathname={pathname}
      navGroups={groups}
      title={pageContext.title}
      eyebrow={pageContext.eyebrow}
      description={
        showProcurement
          ? "Ưu tiên nhịp nhập hàng HQ, điều chuyển liên site và hàng đợi xử lý theo vai trò để giảm việc phải tự nhớ bước tiếp theo."
          : siteKind === "branch"
            ? "Tập trung vào nhận hàng nội bộ, cấp bếp, kiểm kê và xử lý cảnh báo ngay trong ca vận hành."
            : "Giữ điều hướng bám sát tuyến vận hành thật của site thay vì tách rời theo từng chứng từ."
      }
      badge={
        <Badge variant="secondary">
          <MapPin className="size-3.5" />
          {siteName}
        </Badge>
      }
      sidebarHeader={
        <div className="rounded-3xl border border-sidebar-border/70 bg-sidebar-accent/70 p-4 text-sidebar-foreground shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Package className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                Site vận hành
              </p>
              <p className="font-heading text-2xl font-semibold">Kho vận</p>
              <p className="text-sm text-sidebar-foreground/72">{siteName}</p>
              <p className="text-xs text-sidebar-foreground/60">
                {getInventorySiteKindLabelVi(siteKind)}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-sidebar-border/60 bg-sidebar px-3 py-2.5 text-xs leading-5 text-sidebar-foreground/75">
            Điều hướng được gom theo tuyến công việc: hôm nay, nhập hàng HQ, điều chuyển, vận hành chi nhánh, kiểm soát và danh mục.
          </div>
        </div>
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/inventory/reports">Báo cáo</Link>
          </Button>
          {showProcurement ? (
            <Button asChild size="sm">
              <Link href="/inventory/purchase-orders/new">
                <PackagePlus className="size-4" />
                Tạo PO mới
              </Link>
            </Button>
          ) : null}
        </>
      }
      headerMeta={
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Site
              </p>
              <p className="mt-2 font-heading text-2xl font-semibold">
                {siteName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {getInventorySiteKindLabelVi(siteKind)}
              </p>
            </div>
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Quyền hiện tại
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {ROLE_LABEL_VI[userRole]}
              </p>
            </div>
            <div className="app-stat">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Procurement
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {showProcurement ? "Đã mở tuyến NCC & công thức" : "Ẩn theo ACL hiện tại"}
              </p>
            </div>
          </div>
          <div className="app-subpanel flex items-center gap-3 p-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL_VI[userRole]}
              </p>
            </div>
          </div>
        </div>
      }
      sidebarFooter={
        <div className="space-y-3 rounded-3xl border border-sidebar-border/70 bg-sidebar-accent/70 p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/65">
                {ROLE_LABEL_VI[userRole]}
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <Button asChild variant="ghost" size="sm" className="justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground">
              <Link href="/inventory/reports">
                <BarChart3 className="size-4" />
                Mở báo cáo
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground">
              <Link href="/inventory/stocktake">
                <ClipboardList className="size-4" />
                Đi tới kiểm kê
              </Link>
            </Button>
            {siteKind === "branch" ? (
              <Button asChild variant="ghost" size="sm" className="justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground">
                <Link href="/inventory/issues">
                  <PackageOpen className="size-4" />
                  Mở cấp bếp
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
