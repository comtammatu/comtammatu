"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@comtammatu/ui/components/breadcrumb";
import { cn } from "@comtammatu/ui";
import { ChevronRight, MapPin, PackagePlus } from "lucide-react";
import { InventoryMobileNav } from "./inventory-sidebar";
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
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <InventoryMobileNav userRole={userRole} />
            <div className="min-w-0 space-y-3">
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

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2 shadow-sm">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MapPin className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {siteName}
                    </p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {siteKindLabel}
                    </p>
                  </div>
                </div>

                <Badge variant="outline" className="font-medium">
                  {routeLabel}
                </Badge>
                <Badge variant={canAccessProcurement ? "success" : "secondary"}>
                  {canAccessProcurement ? "Procurement mở" : "Core kho vận"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Button asChild size="sm" variant="outline">
              <Link href="/inventory/grn">Mở GRN</Link>
            </Button>
            {canAccessProcurement ? (
              <Button asChild size="sm">
                <Link href="/inventory/purchase-orders/new">
                  <PackagePlus className="size-4" />
                  Tạo PO mới
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 md:hidden">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ChevronRight className="size-4 opacity-50" />
            <span className={cn("truncate font-medium text-foreground")}>
              {routeLabel}
            </span>
          </div>
          {canAccessProcurement ? (
            <Button asChild size="sm">
              <Link href="/inventory/purchase-orders/new">
                <PackagePlus className="size-4" />
                Tạo PO
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
