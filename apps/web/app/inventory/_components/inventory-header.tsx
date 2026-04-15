"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@comtammatu/ui/components/breadcrumb";
import { Separator } from "@comtammatu/ui/components/separator";
import { SidebarTrigger } from "@comtammatu/ui/components/sidebar";
import { MapPin, PackagePlus } from "lucide-react";
import { tRoute } from "../_lib/dictionary";

function getBreadcrumbs(pathname: string) {
  const base = "Kho vận";
  const label = tRoute(pathname, "heading");

  if (label !== pathname) {
    return [base, label];
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 3) {
    const parentPath = `/${segments.slice(0, 2).join("/")}`;
    const parentLabel = tRoute(parentPath, "heading");

    return [
      base,
      parentLabel === parentPath ? segments[1] ?? "Danh mục" : parentLabel,
      decodeURIComponent(segments[2] ?? ""),
    ];
  }

  return [base, "Tổng quan"];
}

export function InventoryHeader({
  siteName,
  siteKind,
  userRole,
}: {
  siteName: string;
  siteKind: string;
  userRole: StaffRole;
}) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);
  const canAccessProcurement = canAccess(userRole, "inventory_procurement");
  const siteKindLabel = getInventorySiteKindLabelVi(siteKind);
  const routeLabel = breadcrumbs[breadcrumbs.length - 1] ?? "Tổng quan";

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b bg-background px-4 py-2 sm:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-6" />

      <Breadcrumb className="hidden md:block">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => (
            <BreadcrumbItem key={`${crumb}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              {index === breadcrumbs.length - 1 ? (
                <BreadcrumbPage>{crumb}</BreadcrumbPage>
              ) : (
                <span className="text-muted-foreground">{crumb}</span>
              )}
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <p className="truncate text-sm font-medium md:hidden">{routeLabel}</p>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 lg:flex">
          <MapPin className="size-3.5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {siteName} · {siteKindLabel}
          </span>
        </div>

        <Button asChild size="sm" variant="outline" className="hidden sm:flex">
          <Link href="/inventory/grn">Mở GRN</Link>
        </Button>

        {canAccessProcurement ? (
          <Button asChild size="sm">
            <Link href="/inventory/purchase-orders/new">
              <PackagePlus className="size-4" />
              <span className="hidden sm:inline">Tạo PO mới</span>
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
