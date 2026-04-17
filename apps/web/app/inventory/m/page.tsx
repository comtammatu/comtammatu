import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Factory,
  Package,
  Receipt,
  Truck,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { canAccess } from "@comtammatu/shared/auth";
import { MobilePage } from "../_components/mobile/mobile-page";
import { InteractiveCard } from "../_components/mobile/interactive-card";
import { MobileSectionHeader } from "../_components/mobile/mobile-section-header";
import { canAccessProductionSurface } from "../production-data";

type ActionTile = {
  href: string;
  icon: typeof Receipt;
  title: string;
  description: string;
  badge?: string;
};

async function fetchHubCounts(): Promise<{
  openPoCount: number;
  pendingTransferCount: number;
  draftProductionCount: number;
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
      canOpenProduction: false,
    };
  }
  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    return {
      openPoCount: 0,
      pendingTransferCount: 0,
      draftProductionCount: 0,
      canOpenProduction: false,
    };
  }

  const [poRes, tfRes, currentBranchRes, centralKitchenRes] = await Promise.all(
    [
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .in("status", ["sent", "partially_received"]),
      supabase
        .from("stock_transfers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .in("status", ["confirmed_ship", "in_transit", "confirmed_receive"]),
      claims.branch_id
        ? supabase
            .from("branches")
            .select("branch_kind")
            .eq("tenant_id", claims.tenant_id)
            .eq("id", claims.branch_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .eq("branch_kind", "central_kitchen"),
    ],
  );

  const currentBranchKind = currentBranchRes.data?.branch_kind ?? null;
  const hasCentralKitchen = (centralKitchenRes.count ?? 0) > 0;

  const canOpenProduction =
    canAccessProductionSurface(claims.user_role) &&
    (currentBranchKind === "central_kitchen" ||
      (currentBranchKind === null && !hasCentralKitchen));

  const draftProductionRes = canOpenProduction
    ? await (currentBranchKind === "central_kitchen" && claims.branch_id != null
        ? supabase
            .from("production_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("branch_id", claims.branch_id)
            .eq("status", "draft")
        : supabase
            .from("production_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", claims.tenant_id)
            .eq("status", "draft"))
    : null;

  return {
    openPoCount: poRes.count ?? 0,
    pendingTransferCount: tfRes.count ?? 0,
    draftProductionCount: draftProductionRes?.count ?? 0,
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
  const role = session
    ? extractClaims(session.user.app_metadata)?.user_role
    : undefined;
  const showProcurement = role
    ? canAccess(role, "inventory_procurement")
    : false;

  const {
    openPoCount,
    pendingTransferCount,
    draftProductionCount,
    canOpenProduction,
  } = await fetchHubCounts();

  const primaryTiles: ActionTile[] = [];
  if (showProcurement) {
    primaryTiles.push({
      href: "/inventory/m/grn",
      icon: Receipt,
      title: "Nhập hàng",
      description: "Tạo phiếu nhập từ nhà cung cấp",
      badge: openPoCount > 0 ? `${openPoCount} PO chờ nhận` : undefined,
    });
  }
  if (canOpenProduction) {
    primaryTiles.push({
      href: "/inventory/m/production",
      icon: Factory,
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
    icon: Truck,
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
      icon: Package,
      title: "Tồn kho chi tiết",
      description: "Mở màn hình tồn kho đầy đủ",
    },
    {
      href: "/inventory",
      icon: BarChart3,
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
                    <span className="mt-1 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                      {tile.badge}
                    </span>
                  ) : null}
                </div>
                <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
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

      {showProcurement ? (
        <div className="pt-4 text-center">
          <Link
            href="/inventory/m/drafts"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ClipboardList className="size-4" />
            Phiếu nháp đã lưu
          </Link>
        </div>
      ) : null}
    </MobilePage>
  );
}
