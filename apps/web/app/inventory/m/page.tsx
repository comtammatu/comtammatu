import Link from "next/link";
import {
  IconArrowRight,
  IconChartBar,
  IconClipboardList,
  IconBuildingFactory,
  IconPackage,
  IconReceipt,
  IconTruck,
} from "@tabler/icons-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { Badge } from "@comtammatu/ui/components/badge";
import { MobilePage } from "../_components/mobile/mobile-page";
import { InteractiveCard } from "../_components/mobile/interactive-card";
import { MobileSectionHeader } from "../_components/mobile/mobile-section-header";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  isProductionBranchScopedRole,
  PRODUCTION_OPEN_PERMISSIONS,
} from "../production-data";

type ActionTile = {
  href: string;
  icon: typeof IconReceipt;
  title: string;
  description: string;
  badge?: string;
};

async function fetchHubCounts(): Promise<{
  openPoCount: number;
  pendingTransferCount: number;
  draftProductionCount: number;
  canOpenProcurement: boolean;
  canOpenProduction: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return {
      openPoCount: 0,
      pendingTransferCount: 0,
      draftProductionCount: 0,
      canOpenProcurement: false,
      canOpenProduction: false,
    };
  }
  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) {
    return {
      openPoCount: 0,
      pendingTransferCount: 0,
      draftProductionCount: 0,
      canOpenProcurement: false,
      canOpenProduction: false,
    };
  }

  const [
    canOpenProcurement,
    hasProductionPermission,
    hasProductionBranchAccess,
  ] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
    hasCurrentProductionBranchAccess(supabase, claims),
  ]);
  const canOpenProduction =
    canAccessProductionSurface(claims.user_role) &&
    hasProductionPermission &&
    hasProductionBranchAccess;

  const [poRes, tfRes, draftProductionRes] = await Promise.all([
    canOpenProcurement
      ? supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .in("status", ["sent", "partially_received"])
      : Promise.resolve({ count: 0 }),
    supabase
      .from("stock_transfers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["confirmed_ship", "in_transit", "confirmed_receive"]),
    canOpenProduction
      ? (() => {
          let query = supabase
            .from("production_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("status", "draft");

          if (
            isProductionBranchScopedRole(claims.user_role) &&
            claims.branch_id != null
          ) {
            query = query.eq("branch_id", claims.branch_id);
          }

          return query;
        })()
      : Promise.resolve({ count: 0 }),
  ]);

  return {
    openPoCount: poRes.count ?? 0,
    pendingTransferCount: tfRes.count ?? 0,
    draftProductionCount: draftProductionRes.count ?? 0,
    canOpenProcurement,
    canOpenProduction,
  };
}

export default async function InventoryMobileHub() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const name = session?.user.user_metadata?.["display_name"] as
    | string
    | undefined;
  const {
    openPoCount,
    pendingTransferCount,
    draftProductionCount,
    canOpenProcurement,
    canOpenProduction,
  } = await fetchHubCounts();

  const primaryTiles: ActionTile[] = [];
  if (canOpenProcurement) {
    primaryTiles.push({
      href: "/inventory/m/grn",
      icon: IconReceipt,
      title: "Nhập hàng",
      description: "Tạo phiếu nhập từ nhà cung cấp",
      badge: openPoCount > 0 ? `${openPoCount} PO chờ nhận` : undefined,
    });
  }
  if (canOpenProduction) {
    primaryTiles.push({
      href: "/inventory/m/production",
      icon: IconBuildingFactory,
      title: "Bếp trung tâm",
      description: "Tạo lệnh sản xuất và chốt thành phẩm",
      badge:
        draftProductionCount > 0
          ? `${draftProductionCount} lệnh nháp`
          : undefined,
    });
  }
  primaryTiles.push({
    href: "/inventory/m/transfers",
    icon: IconTruck,
    title: "Điều chuyển",
    description: "Nhận hàng & kiểm nhập nội bộ",
    badge:
      pendingTransferCount > 0
        ? `${pendingTransferCount} phiếu cần xử lý`
        : undefined,
  });

  const secondaryTiles: ActionTile[] = [
    {
      href: "/inventory/stock",
      icon: IconPackage,
      title: "Tồn kho chi tiết",
      description: "Mở màn hình tồn kho đầy đủ",
    },
    {
      href: "/inventory",
      icon: IconChartBar,
      title: "Bản đầy đủ",
      description: "Chuyển sang giao diện desktop",
    },
  ];

  return (
    <MobilePage>
      <MobileSectionHeader
        eyebrow="Trang chính"
        title={name ? `Xin chào, ${name.split(" ")[0] ?? ""}` : "Xin chào"}
        description="Chọn thao tác bạn cần làm ngay bây giờ."
      />

      <div className="flex flex-col gap-3">
        {primaryTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <InteractiveCard
              key={tile.href}
              asChild
              minHeight="mobile"
              padding="default"
              className="h-auto bg-card px-4 py-4"
            >
              <Link href={tile.href}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-tight">
                    {tile.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tile.description}
                  </p>
                  {tile.badge ? (
                    <Badge variant="warning" className="mt-1">
                      {tile.badge}
                    </Badge>
                  ) : null}
                </div>
                <IconArrowRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </InteractiveCard>
          );
        })}
      </div>

      <div className="pt-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Truy cập nhanh
        </p>
        <div className="grid grid-cols-2 gap-3">
          {secondaryTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <InteractiveCard
                key={tile.href}
                asChild
                padding="default"
                className="h-auto border-dashed px-3 py-3"
              >
                <Link href={tile.href} className="flex-col items-start gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      {tile.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tile.description}
                    </p>
                  </div>
                </Link>
              </InteractiveCard>
            );
          })}
        </div>
      </div>

      {canOpenProcurement ? (
        <div className="pt-4 text-center">
          <Link
            href="/inventory/m/drafts"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <IconClipboardList className="size-4" />
            Phiếu nháp đã lưu
          </Link>
        </div>
      ) : null}
    </MobilePage>
  );
}
