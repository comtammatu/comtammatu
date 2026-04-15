"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import {
  findActiveNavItem,
  formatPathSegment,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
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
  ];
}

function resolveContext(pathname: string, groups: ShellNavGroup[]) {
  const directLabel = tRoute(pathname, "heading");
  if (directLabel !== pathname) {
    const active = findActiveNavItem(groups, pathname);
    return {
      title: directLabel,
      eyebrow: active?.label ?? "Kho hàng",
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
    eyebrow: active?.label ?? "Kho hàng",
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
    <div className="surface-shell paper-grid-dark flex h-dvh flex-col gap-5 overflow-hidden p-4">
      <div className="rounded-4xl border border-white/10 bg-white/10 p-5">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/70">
            <PackagePlus className="size-3.5" />
            Kho hàng
          </div>
          <div className="space-y-3">
            <div className="flex size-14 items-center justify-center rounded-full border border-white/12 bg-sidebar-primary text-sidebar-primary-foreground">
              <Package className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-sidebar-foreground">
                Điều hành kho
              </p>
              <p className="mt-2 text-sm leading-6 text-sidebar-foreground/70">
                Theo dõi nhập xuất tồn, phối hợp chứng từ và giữ nhịp vận hành
                liên site.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
              Bối cảnh
            </p>
            <p className="mt-2 text-lg font-semibold text-sidebar-foreground">
              {siteName}
            </p>
            <p className="text-sm text-sidebar-foreground/65">
              {getInventorySiteKindLabelVi(siteKind)}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {groups.map((group) => (
          <section key={group.title} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
              {group.title}
            </p>
            <div className="space-y-2">
              {group.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-3xl border px-3 py-3 transition-all",
                      active
                        ? "border-sidebar-primary/35 bg-sidebar-primary text-sidebar-primary-foreground shadow-app-sm"
                        : "border-white/8 bg-white/4 text-sidebar-foreground/72 hover:border-white/12 hover:bg-white/8 hover:text-sidebar-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-11 items-center justify-center rounded-full border",
                        active
                          ? "border-white/12 bg-white/12"
                          : "border-white/10 bg-sidebar-accent text-sidebar-foreground/80",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-2">
        <Link
          href="/inventory/reports"
          onClick={onNavigate}
          className="touch-target flex items-center justify-center gap-2 rounded-full bg-sidebar-primary px-4 text-sm font-semibold text-sidebar-primary-foreground transition-colors hover:bg-sidebar-primary/90"
        >
          <BarChart3 className="size-4" />
          Mở báo cáo
        </Link>
        <Link
          href="/inventory/stocktake"
          onClick={onNavigate}
          className="touch-target flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-white/10"
        >
          <ClipboardList className="size-4" />
          Đi tới kiểm kê
        </Link>
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
    <div data-slot="app-shell" className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto min-h-dvh max-w-screen-2xl gap-4 px-3 py-3 xl:flex">
        <aside className="hidden xl:block">
          <div className="sticky top-3">
            <InventoryRail
              pathname={pathname}
              groups={groups}
              siteName={siteName}
              siteKind={siteKind}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <header className="surface-panel-strong sticky top-3 z-30 overflow-hidden px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="touch-target flex items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground xl:hidden"
                  aria-label="Mở điều hướng"
                >
                  <Menu className="size-5" />
                </button>
                <div className="space-y-2">
                  <p className="ops-kicker">{pageContext.eyebrow}</p>
                  <div className="space-y-1">
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                      {pageContext.title}
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Duy trì nhịp nhập, nhận, điều chuyển và sản xuất trong một
                      bề mặt hành động-first.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="ops-chip">
                  <MapPin className="size-3.5 text-primary" />
                  {siteName} · {getInventorySiteKindLabelVi(siteKind)}
                </span>
                <Link
                  href="/inventory/grn"
                  className="touch-target inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  <ArrowLeftRight className="size-4" />
                  Mở GRN
                </Link>
                {showProcurement ? (
                  <Link
                    href="/inventory/purchase-orders/new"
                    className="touch-target inline-flex items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <PackagePlus className="size-4" />
                    Tạo PO mới
                  </Link>
                ) : null}
              </div>
            </div>
          </header>

          <main id="main-content" className="min-w-0 pb-6">
            <div className="space-y-4">{children}</div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/55 xl:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMobileOpen(false);
              }
            }}
            aria-label="Đóng điều hướng"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm p-3 xl:hidden">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="touch-target absolute right-5 top-5 z-10 flex items-center justify-center rounded-full border border-white/10 bg-white/10 text-sidebar-foreground"
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
