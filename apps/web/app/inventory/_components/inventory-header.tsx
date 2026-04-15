"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Badge,
} from "@comtammatu/ui/components/badge";
import {
  Button,
} from "@comtammatu/ui/components/button";
import { SidebarTrigger } from "@comtammatu/ui/components/sidebar";
import {
  ChevronRight,
  MapPin,
  PackagePlus,
} from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { tRoute } from "../_lib/dictionary";

function getBreadcrumbs(pathname: string) {
  const base = "Trang chủ";
  const label = tRoute(pathname, "heading");
  if (label !== pathname) return [base, label];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 3) {
    const parentPath = "/" + segments.slice(0, 2).join("/");
    const parentLabel = tRoute(parentPath, "heading");
    return [
      base,
      parentLabel === parentPath ? segments[1] : parentLabel,
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
  const crumbs = getBreadcrumbs(pathname);
  const canAccessProcurement = canAccess(userRole, "inventory_procurement");
  const siteKindLabel = getInventorySiteKindLabelVi(siteKind);
  const routeLabel = crumbs[crumbs.length - 1] ?? "Tổng quan";

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b bg-background px-4 py-3 sm:px-6"
    >
      <SidebarTrigger className="md:hidden" />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="hidden items-center text-xs font-medium uppercase tracking-wider text-muted-foreground md:flex">
          {crumbs.map((crumb, i) => (
            <span key={crumb} className="flex items-center">
              {i > 0 && <ChevronRight className="mx-1.5 size-3.5 opacity-40" />}
              <span
                className={cn(
                  i === crumbs.length - 1
                    ? "font-bold text-primary"
                    : "text-muted-foreground",
                )}
              >
                {crumb}
              </span>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground shadow-sm">
            <MapPin className="size-3.5" />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="truncate">{siteName}</span>
              <span className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                {siteKindLabel}
              </span>
            </span>
          </div>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Badge variant="outline">
              {routeLabel}
            </Badge>
            <Badge variant={canAccessProcurement ? "success" : "secondary"}>
              {canAccessProcurement
                ? "Procurement mở"
                : "Core kho vận"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {canAccessProcurement ? (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/grn">GRN</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/inventory/purchase-orders/new">
                <PackagePlus className="size-4" />
                Tạo đơn đặt hàng NCC
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
