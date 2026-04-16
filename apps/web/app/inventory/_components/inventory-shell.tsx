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
import {
  canAccess,
  ROLE_LABEL_VI,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { tNav, tRoute } from "../_lib/dictionary";

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
      {
        href: "/inventory/stock",
        label: tNav("stock", "navigation"),
        icon: Package,
      },
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
    <SidebarProvider>
      <div className="flex min-h-dvh w-full">
        <Sidebar variant="inset">
          <SidebarHeader className="gap-4 p-4">
            <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-4 text-sidebar-foreground">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Package className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
                    Site vận hành
                  </p>
                  <p className="text-xl font-semibold">Kho vận</p>
                  <p className="text-sm text-sidebar-foreground/72">
                    {siteName}
                  </p>
                  <p className="text-xs text-sidebar-foreground/60">
                    {getInventorySiteKindLabelVi(siteKind)}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-sidebar-border bg-sidebar px-3 py-2.5 text-xs leading-5 text-sidebar-foreground/75">
                Điều hướng được gom theo tuyến công việc: hôm nay, nhập hàng HQ,
                điều chuyển, vận hành chi nhánh, kiểm soát và danh mục.
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="px-2 pb-4">
            {groups.map((group) => (
              <SidebarGroup key={group.title} className="px-0 py-1">
                <SidebarGroupLabel className="px-2 pb-1 text-xs font-medium text-sidebar-foreground/70">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          size="lg"
                          tooltip={item.label}
                          className="rounded-md"
                        >
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-4">
            <div className="space-y-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
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
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground"
                >
                  <Link href="/inventory/reports">
                    <BarChart3 className="size-4" />
                    Mở báo cáo
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground"
                >
                  <Link href="/inventory/stocktake">
                    <ClipboardList className="size-4" />
                    Đi tới kiểm kê
                  </Link>
                </Button>
                {siteKind === "branch" ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground"
                  >
                    <Link href="/inventory/issues">
                      <PackageOpen className="size-4" />
                      Mở cấp bếp
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-dvh bg-background">
          <div className="flex min-h-full flex-1 flex-col gap-4 p-4">
            <Card className="py-0"><CardContent className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SidebarTrigger className="md:hidden" />
                    <Badge variant="secondary">
                      {pageContext.eyebrow}
                    </Badge>
                    <Badge variant="secondary">
                      <MapPin className="size-3.5" />
                      {siteName}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      {pageContext.title}
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                      {showProcurement
                        ? "Ưu tiên nhịp nhập hàng HQ, điều chuyển liên site và hàng đợi xử lý theo vai trò để giảm việc phải tự nhớ bước tiếp theo."
                        : siteKind === "branch"
                          ? "Tập trung vào nhận hàng nội bộ, cấp bếp, kiểm kê và xử lý cảnh báo ngay trong ca vận hành."
                          : "Giữ điều hướng bám sát tuyến vận hành thật của site thay vì tách rời theo từng chứng từ."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                </div>
              </div>

              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-3 lg:grid-cols-4">
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Người đang thao tác
                      </p>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback>
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {user.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {ROLE_LABEL_VI[userRole]}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Site
                      </p>
                      <p className="text-lg font-semibold">{siteName}</p>
                      <p className="text-xs text-muted-foreground">
                        {getInventorySiteKindLabelVi(siteKind)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Quyền hiện tại
                      </p>
                      <p className="text-sm leading-6 text-foreground">
                        {ROLE_LABEL_VI[userRole]}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Procurement
                      </p>
                      <p className="text-sm leading-6 text-foreground">
                        {showProcurement
                          ? "Đã mở tuyến NCC & công thức"
                          : "Ẩn theo ACL hiện tại"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent></Card>

            <main id="main-content" className="flex-1">
              <div className="space-y-4">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
