"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  Hourglass,
  LayoutDashboard,
  Leaf,
  MapPin,
  Menu,
  Package,
  PackageOpen,
  PackagePlus,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  findActiveNavItem,
  formatPathSegment,
  isNavItemActive,
  type ShellNavGroup,
} from "@/components/v2/shell-primitives";
import { tNav, tRoute } from "../_lib/dictionary";

interface InventoryShellProps {
  children: ReactNode;
  userRole: StaffRole;
  siteName: string;
  siteKind: string;
}

function buildInventoryGroups(showProcurement: boolean): ShellNavGroup[] {
  return [
    {
      title: "Điều phối",
      items: [
        {
          href: "/inventory",
          label: tNav("home", "navigation"),
          icon: LayoutDashboard,
        },
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: Package,
        },
        {
          href: "/inventory/receiving",
          label: tNav("receiving", "navigation"),
          icon: ArrowDownToLine,
        },
      ],
    },
    {
      title: "Nghiệp vụ",
      items: [
        ...(showProcurement
          ? [
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
            ]
          : []),
        {
          href: "/inventory/transfers",
          label: tNav("transfers", "navigation"),
          icon: Truck,
        },
        {
          href: "/inventory/issues",
          label: tNav("issues", "navigation"),
          icon: PackageOpen,
        },
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
          href: "/inventory/production",
          label: tNav("production", "navigation"),
          icon: Factory,
        },
      ],
    },
    {
      title: "Danh mục",
      items: [
        {
          href: "/inventory/ingredients",
          label: tNav("ingredients", "navigation"),
          icon: FileText,
        },
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
        {
          href: "/inventory/reports",
          label: tNav("reports", "navigation"),
          icon: BarChart3,
        },
        {
          href: "/inventory/settings",
          label: tNav("settings", "navigation"),
          icon: Leaf,
        },
      ],
    },
  ].map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}

function resolveContext(pathname: string, groups: ShellNavGroup[]) {
  const directLabel = tRoute(pathname, "heading");
  if (directLabel !== pathname) {
    const active = findActiveNavItem(groups, pathname);
    return {
      title: directLabel,
      eyebrow: active?.label ?? "Kho vận",
    };
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

function InventoryRail({
  pathname,
  groups,
  siteName,
  siteKind,
  onNavigate,
}: {
  pathname: string;
  groups: ShellNavGroup[];
  siteName: string;
  siteKind: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="surface-shell flex h-full flex-col p-4">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/55">
          Inventory OS
        </p>
        <h2 className="mt-2 text-xl font-semibold text-sidebar-foreground">
          Kho vận
        </h2>
        <p className="mt-2 text-sm leading-6 text-sidebar-foreground/70">
          Điều phối nhập xuất, kiểm soát tồn và theo dõi điểm nghẽn vận hành.
        </p>
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
            Bối cảnh
          </p>
          <p className="mt-2 text-sm font-semibold text-sidebar-foreground">
            {siteName}
          </p>
          <p className="text-sm text-sidebar-foreground/65">
            {getInventorySiteKindLabelVi(siteKind)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto pr-1">
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.title} className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isNavItemActive(item, pathname);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition-colors",
                        active
                          ? "border-sidebar-primary/40 bg-sidebar-primary text-sidebar-primary-foreground"
                          : "border-transparent text-sidebar-foreground/72 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl border",
                          active
                            ? "border-white/10 bg-white/10"
                            : "border-sidebar-border bg-sidebar-accent/80",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <Button asChild className="h-11 rounded-2xl">
          <Link href="/inventory/reports" onClick={onNavigate}>
            <BarChart3 className="size-4" />
            Mở báo cáo
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-2xl border-white/10 bg-white/5 text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
        >
          <Link href="/inventory/stocktake" onClick={onNavigate}>
            <ClipboardList className="size-4" />
            Đi tới kiểm kê
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function InventoryShell({
  children,
  userRole,
  siteName,
  siteKind,
}: InventoryShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showProcurement = canAccess(userRole, "inventory_procurement");
  const groups = useMemo(
    () => buildInventoryGroups(showProcurement),
    [showProcurement],
  );
  const pageContext = useMemo(
    () => resolveContext(pathname, groups),
    [groups, pathname],
  );

  return (
    <div className="min-h-dvh bg-background text-foreground md:p-3">
      <div className="mx-auto flex min-h-dvh w-full max-w-screen-2xl gap-3">
        <aside className="hidden w-80 shrink-0 md:block">
          <div className="sticky top-3 h-dvh">
            <InventoryRail
              pathname={pathname}
              groups={groups}
              siteName={siteName}
              siteKind={siteKind}
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <header className="surface-panel sticky top-0 z-30 px-4 py-4 md:top-3 md:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-panel-subtle text-foreground md:hidden"
                aria-label="Mở điều hướng"
              >
                <Menu className="size-5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {pageContext.eyebrow}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {pageContext.title}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  <MapPin className="mr-1 size-3.5" />
                  {siteName} · {getInventorySiteKindLabelVi(siteKind)}
                </Badge>
                <Button asChild variant="outline" className="h-11 rounded-full">
                  <Link href="/inventory/grn">
                    <ArrowLeftRight className="size-4" />
                    Mở GRN
                  </Link>
                </Button>
                {showProcurement ? (
                  <Button asChild className="h-11 rounded-full">
                    <Link href="/inventory/purchase-orders/new">
                      <PackagePlus className="size-4" />
                      Tạo PO mới
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </header>

          <main
            id="main-content"
            className="min-w-0 flex-1 overflow-y-auto pb-6"
          >
            <div className="space-y-4">{children}</div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMobileOpen(false);
              }
            }}
            aria-label="Đóng điều hướng"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-80 max-w-full p-3 md:hidden">
            <div className="relative h-full">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-6 top-6 z-10 flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-sidebar-foreground"
                aria-label="Đóng"
              >
                <X className="size-4" />
              </button>
              <InventoryRail
                pathname={pathname}
                groups={groups}
                siteName={siteName}
                siteKind={siteKind}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
