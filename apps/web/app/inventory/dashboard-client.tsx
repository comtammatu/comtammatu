"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  Hourglass,
  Lightbulb,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { StatCard, StatusBadge } from "./_components/shared";
import { formatVND } from "./_lib/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const dayNames = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];
const monthNames = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

function formatDate(d: Date) {
  return `${dayNames[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} Tháng ${monthNames[d.getMonth()]}, ${d.getFullYear()}`;
}

function formatTime(d: Date) {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h < 12 ? "SA" : "CH";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, "0")}:${m} ${period}`;
}

type DashboardSiteKind = "headquarters" | "central_kitchen" | "branch";

type QuickAction = {
  icon: ReactNode;
  label: string;
  description: string;
  href: string;
  hoverClassName: string;
  iconClassName: string;
};

type PriorityItem = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: ReactNode;
  panelClassName: string;
  iconClassName: string;
};

function buildQuickActions(
  siteKind: DashboardSiteKind,
  routeBase: InventoryRouteBase,
): QuickAction[] {
  const paths = getInventoryPaths(routeBase);

  if (siteKind === "headquarters") {
    return [
      {
        icon: <ShoppingCart className="size-7" />,
        label: "Nhập nguyên liệu",
        description: "Ghi nhận hàng từ nhà cung cấp về kho trụ sở.",
        href: paths.receiving,
        hoverClassName: "hover:bg-primary/10",
        iconClassName: "text-primary",
      },
      {
        icon: <Truck className="size-7" />,
        label: "Điều chuyển",
        description: "Theo dõi luồng xuất, nhận và hàng đang trên đường.",
        href: paths.transfers,
        hoverClassName: "hover:bg-info/10",
        iconClassName: "text-info",
      },
      {
        icon: <CheckSquare className="size-7" />,
        label: "Kiểm kê",
        description: "Mở hoặc tiếp tục các phiên kiểm kê đang thực hiện.",
        href: paths.stocktake,
        hoverClassName: "hover:bg-success/10",
        iconClassName: "text-success",
      },
      {
        icon: <BarChart3 className="size-7" />,
        label: "Báo cáo",
        description: "Xem biến động tồn, hạn dùng và giá trị tồn kho.",
        href: paths.reports,
        hoverClassName: "hover:bg-muted",
        iconClassName: "text-muted-foreground",
      },
    ];
  }

  if (siteKind === "central_kitchen") {
    return [
      {
        icon: <Lightbulb className="size-7" />,
        label: "Tạo lệnh sản xuất",
        description: "Mở nhanh lệnh mới cho bếp trung tâm.",
        href: paths.production,
        hoverClassName: "hover:bg-primary/10",
        iconClassName: "text-primary",
      },
      {
        icon: <Truck className="size-7" />,
        label: "Xuất thành phẩm",
        description: "Điều phối hàng giữa bếp trung tâm và chi nhánh.",
        href: paths.transfers,
        hoverClassName: "hover:bg-info/10",
        iconClassName: "text-info",
      },
      {
        icon: <CheckSquare className="size-7" />,
        label: "Kiểm kê",
        description: "Kiểm tra chênh lệch tồn nguyên liệu và thành phẩm.",
        href: paths.stocktake,
        hoverClassName: "hover:bg-success/10",
        iconClassName: "text-success",
      },
      {
        icon: <BarChart3 className="size-7" />,
        label: "Báo cáo",
        description: "Tổng hợp sản xuất, chuyển kho và cảnh báo phát sinh.",
        href: paths.reports,
        hoverClassName: "hover:bg-muted",
        iconClassName: "text-muted-foreground",
      },
    ];
  }

  return [
    {
      icon: <ShoppingCart className="size-7" />,
      label: "Nhận hàng",
      description: "Cập nhật hàng nhận từ trụ sở hoặc nguồn nội bộ.",
      href: paths.receiving,
      hoverClassName: "hover:bg-primary/10",
      iconClassName: "text-primary",
    },
    {
      icon: <CheckSquare className="size-7" />,
      label: "Kiểm kê chi nhánh",
      description: "Đối chiếu tồn thực tế trước khi chốt ca vận hành.",
      href: paths.stocktake,
      hoverClassName: "hover:bg-success/10",
      iconClassName: "text-success",
    },
    {
      icon: <Truck className="size-7" />,
      label: "Điều chuyển",
      description: "Theo dõi hàng đi, hàng đến và các bước xác nhận.",
      href: paths.transfers,
      hoverClassName: "hover:bg-info/10",
      iconClassName: "text-info",
    },
    {
      icon: <BarChart3 className="size-7" />,
      label: "Báo cáo",
      description: "Xem nhanh mức tồn, cảnh báo và giá trị kho.",
      href: paths.reports,
      hoverClassName: "hover:bg-muted",
      iconClassName: "text-muted-foreground",
    },
  ];
}

function getPressureLabel(operationalPressure: number) {
  if (operationalPressure >= 70) return "Cần ưu tiên";
  if (operationalPressure >= 35) return "Đang theo dõi";
  return "Ổn định";
}

function buildPriorityItems({
  showProcurement,
  reorderAlerts,
  expiryAlerts,
  activeTransfers,
  activeStocktakes,
  paths,
}: {
  showProcurement: boolean;
  reorderAlerts: DashboardProps["reorderAlerts"];
  expiryAlerts: DashboardProps["expiryAlerts"];
  activeTransfers: number;
  activeStocktakes: number;
  paths: ReturnType<typeof getInventoryPaths>;
}): PriorityItem[] {
  const items: PriorityItem[] = [];

  const topReorder = reorderAlerts[0];
  if (topReorder) {
    const reorderName = topReorder.name;
    const reorderCurrent = topReorder.current;
    const reorderUnit = topReorder.unit;
    const reorderPoint = topReorder.reorder;

    items.push({
      key: "reorder",
      eyebrow: "Tái đặt hàng",
      title:
        reorderAlerts.length === 1
          ? reorderName
          : `${reorderAlerts.length} nguyên liệu dưới ngưỡng`,
      description:
        reorderAlerts.length === 1
          ? `Tồn hiện tại ${reorderCurrent}${reorderUnit}, ngưỡng ${reorderPoint}${reorderUnit}.`
          : `Kiểm tra và xử lý các nguyên liệu đang chạm mức tái đặt hàng.`,
      href: showProcurement ? paths.purchaseOrders : paths.stock,
      cta: showProcurement ? "Mở đơn mua" : "Xem tồn kho",
      icon: <ShoppingCart className="size-5" />,
      panelClassName:
        "border-destructive/20 bg-destructive/5",
      iconClassName: "bg-destructive/10 text-destructive",
    });
  }

  const topExpiry = expiryAlerts[0];
  if (topExpiry) {
    const expiryName = topExpiry.ingredientName;
    const expiryLot = topExpiry.lot || "không mã";
    const expiryDaysLeft = topExpiry.daysLeft;

    items.push({
      key: "expiry",
      eyebrow: "Hạn dùng",
      title:
        expiryAlerts.length === 1
          ? expiryName
          : `${expiryAlerts.length} lô cần theo dõi hạn dùng`,
      description:
        expiryAlerts.length === 1
          ? expiryDaysLeft <= 0
            ? `Lô ${expiryLot} đã quá hạn ${Math.abs(expiryDaysLeft)} ngày.`
            : `Lô ${expiryLot} còn ${expiryDaysLeft} ngày trước hạn dùng.`
          : `Ưu tiên xuất hoặc xử lý các lô sắp hết hạn trong kho.`,
      href: paths.expiry,
      cta: "Mở hạn dùng",
      icon: <Hourglass className="size-5" />,
      panelClassName:
        "border-warning/20 bg-warning/5",
      iconClassName: "bg-warning/10 text-warning",
    });
  }

  if (activeTransfers > 0) {
    items.push({
      key: "transfers",
      eyebrow: "Điều chuyển",
      title:
        activeTransfers === 1
          ? "1 phiếu đang mở"
          : `${activeTransfers} phiếu đang mở`,
      description:
        "Theo dõi tiến độ xuất, nhận và các bước xác nhận liên quan.",
      href: paths.transfers,
      cta: "Mở điều chuyển",
      icon: <Truck className="size-5" />,
      panelClassName:
        "border-info/20 bg-info/5",
      iconClassName: "bg-info/10 text-info",
    });
  }

  if (activeStocktakes > 0) {
    items.push({
      key: "stocktake",
      eyebrow: "Kiểm kê",
      title:
        activeStocktakes === 1
          ? "1 phiên đang thực hiện"
          : `${activeStocktakes} phiên đang thực hiện`,
      description:
        "Hoàn tất các phiên kiểm kê để khóa chênh lệch và cập nhật tồn.",
      href: paths.stocktake,
      cta: "Mở kiểm kê",
      icon: <ClipboardList className="size-5" />,
      panelClassName:
        "border-success/20 bg-success/5",
      iconClassName: "bg-success/10 text-success",
    });
  }

  return items.slice(0, 4);
}

export type DashboardProps = {
  routeBase: InventoryRouteBase;
  siteName: string;
  siteKind: DashboardSiteKind;
  showProcurement: boolean;
  totalStockValue: number;
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  reorderAlerts: Array<{
    ingredientId: number;
    branchId: number;
    name: string;
    current: number;
    reorder: number;
    unit: string;
  }>;
  expiryAlerts: Array<{
    id: number;
    ingredientName: string;
    lot: string;
    expiryDate: string;
    daysLeft: number;
    urgency: string;
  }>;
  transfers: Array<{
    id: number;
    code: string;
    fromBranch: string;
    toBranch: string;
    status: string;
  }>;
  stocktakeSessions: Array<{
    id: number;
    code: string;
    branchName: string;
    progress: number;
    status: string;
  }>;
};

export function DashboardClient({
  routeBase,
  siteName,
  siteKind,
  showProcurement,
  totalStockValue,
  pendingPO,
  activeTransfers,
  activeStocktakes,
  reorderAlerts,
  expiryAlerts,
  transfers,
  stocktakeSessions,
}: DashboardProps) {
  const now = useCurrentTime();
  const panelClassName = "rounded-lg border bg-card shadow-sm";
  const siteKindLabel = getInventorySiteKindLabelVi(siteKind);
  const paths = getInventoryPaths(routeBase);
  const quickActions = buildQuickActions(siteKind, routeBase);
  const alertCount = reorderAlerts.length + expiryAlerts.length;
  const activeFlowCount = pendingPO + activeTransfers + activeStocktakes;
  const operationalPressure = Math.min(
    100,
    alertCount * 14 + activeFlowCount * 8,
  );
  const pressureLabel = getPressureLabel(operationalPressure);
  const priorityItems = buildPriorityItems({
    showProcurement,
    reorderAlerts,
    expiryAlerts,
    activeTransfers,
    activeStocktakes,
    paths,
  });
  const activeTransferList = transfers
    .filter((t) => t.status === "in_transit" || t.status === "confirmed")
    .slice(0, 3);
  const activeStocktakeList = stocktakeSessions.filter(
    (s) => s.status === "in_progress",
  );
  const criticalExpiryCount = expiryAlerts.filter(
    (item) => item.daysLeft <= 0 || item.urgency === "critical",
  ).length;
  const reorderActionHref = showProcurement
    ? paths.purchaseOrders
    : paths.stock;
  const reorderActionLabel = showProcurement ? "Mở đơn mua" : "Xem tồn kho";

  return (
    <div className="space-y-6">
      <div
        className={cn(
          panelClassName,
          "overflow-hidden px-6 py-6 sm:px-7 lg:px-8",
        )}
      >
        <div className="grid gap-6 xl:grid-cols-3 xl:items-start">
          <div className="space-y-5 xl:col-span-2">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Tổng quan ca vận hành
              </p>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Theo dõi kho tại {siteName}
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Giữ nhịp tồn kho, điều chuyển và các cảnh báo phát sinh cho{" "}
                  <span className="font-semibold text-foreground">
                    {siteName}
                  </span>
                  .
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm">
                <Calendar className="size-3.5 shrink-0" />
                {formatDate(now)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm">
                <Clock className="size-3.5 shrink-0" />
                {formatTime(now)}
              </span>
              <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary shadow-sm">
                {siteKindLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-success/15 bg-success/10 px-3 py-2 text-sm font-semibold text-success shadow-sm">
                {showProcurement ? "Procurement mở" : "Core kho vận"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Cảnh báo đang mở
                </p>
                <p className="mt-2 text-3xl font-semibold">{alertCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reorderAlerts.length} tái đặt hàng, {expiryAlerts.length} hạn
                  dùng.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Luồng đang mở
                </p>
                <p className="mt-2 text-3xl font-semibold">{activeFlowCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pendingPO} PO, {activeTransfers} điều chuyển,{" "}
                  {activeStocktakes} kiểm kê.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Điểm cần ưu tiên
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {reorderAlerts.length + criticalExpiryCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tái đặt hàng và các lô sắp quá hạn cần xử lý sớm.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Mức áp lực vận hành
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">
                  {operationalPressure}%
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Tính theo số cảnh báo đang mở và các luồng chưa hoàn tất trong
                  kho.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {pressureLabel}
              </span>
            </div>

            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${operationalPressure}%` }}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Giá trị tồn kho
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {formatVND(totalStockValue)}đ
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Trạng thái theo dõi
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {alertCount === 0 && activeFlowCount === 0
                    ? "Yên nhịp"
                    : "Đang vận hành"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {alertCount === 0 && activeFlowCount === 0
                    ? "Hiện chưa có cảnh báo hoặc luồng chờ xử lý."
                    : "Giữ nhịp xử lý để tránh dồn việc cuối ca."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard
          label="Tổng giá trị tồn kho"
          value={`${formatVND(totalStockValue)}đ`}
        />
        <StatCard label="PO đang chờ" value={String(pendingPO)} />
        <StatCard label="Phiếu điều chuyển" value={String(activeTransfers)} />
        <StatCard label="Phiếu kiểm kê" value={String(activeStocktakes)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className={cn(panelClassName, "rounded-xl bg-card p-6")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Việc cần xử lý trong ca
                </p>
                <h3 className="text-2xl font-semibold tracking-tight">
                  Bảng ưu tiên kho vận
                </h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Gom các tín hiệu quan trọng nhất để vào đúng luồng xử lý, thay
                  vì đi từng màn hình riêng lẻ.
                </p>
              </div>
              <Link
                href={paths.reports}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-muted"
              >
                Mở báo cáo
                <ArrowRight className="size-4" />
              </Link>
            </div>

            {priorityItems.length === 0 ? (
              <div className="mt-5 rounded-lg border border-success/15 bg-success/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-success">
                  Nhịp kho ổn định
                </p>
                <p className="mt-2 text-lg font-semibold">
                  Hiện chưa có đầu việc gấp cần đẩy lên đầu hàng đợi.
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Có thể chuyển sang kiểm tra báo cáo, tồn kho hoặc chuẩn bị cho
                  ca tiếp theo.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {priorityItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      "group flex h-full flex-col justify-between rounded-xl border p-5 transition-transform hover:-translate-y-1",
                      item.panelClassName,
                    )}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={cn(
                            "flex size-11 items-center justify-center rounded-lg shadow-sm",
                            item.iconClassName,
                          )}
                        >
                          {item.icon}
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {item.eyebrow}
                        </p>
                        <h4 className="text-lg font-semibold tracking-tight">
                          {item.title}
                        </h4>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      {item.cta}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className={cn(panelClassName, "rounded-xl bg-card p-6")}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="size-4" />
                    <span>Cảnh báo tái đặt hàng</span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Theo dõi nhanh các nguyên liệu đã chạm ngưỡng để tránh đứt
                    hàng trong ca.
                  </p>
                </div>
                <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                  {reorderAlerts.length} mục
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {reorderAlerts.length === 0 && (
                  <p className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                    Không có cảnh báo tái đặt hàng.
                  </p>
                )}
                {reorderAlerts.slice(0, 4).map((item) => (
                  <div
                    key={`${item.branchId}:${item.ingredientId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"
                  >
                    <div className="min-w-0 flex flex-1 items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-sm font-semibold text-destructive shadow-sm">
                        {item.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tồn kho {item.current}
                          {item.unit} • Ngưỡng {item.reorder}
                          {item.unit}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={reorderActionHref}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-primary shadow-sm transition-transform hover:-translate-y-0.5"
                    >
                      {reorderActionLabel}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn(panelClassName, "rounded-xl bg-card p-6")}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                    <Hourglass className="size-4" />
                    <span>Cảnh báo sắp hết hạn</span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Ưu tiên xử lý các lô cận hạn để giảm hao hụt và tránh hủy
                    hàng.
                  </p>
                </div>
                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                  7 ngày tới
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {expiryAlerts.length === 0 && (
                  <p className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                    Không có hàng sắp hết hạn.
                  </p>
                )}
                {expiryAlerts.slice(0, 4).map((item) => (
                  <Link
                    href={paths.expiry}
                    key={item.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-background p-4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning shadow-sm">
                      <Hourglass className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold">
                        {item.ingredientName}
                        {item.lot ? ` • ${item.lot}` : ""}
                      </h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Hạn dùng {item.expiryDate}</span>
                        <StatusBadge
                          status={item.urgency}
                          label={
                            item.daysLeft <= 0
                              ? `Quá ${Math.abs(item.daysLeft)} ngày`
                              : `Còn ${item.daysLeft} ngày`
                          }
                        />
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className={cn(panelClassName, "rounded-xl bg-card p-6")}>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Thao tác nhanh
              </p>
              <h3 className="text-2xl font-semibold tracking-tight">
                Đi thẳng vào quy trình
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Lối tắt theo đúng vai trò và mô hình site bạn đang vận hành.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={cn(
                    "group flex h-full flex-col gap-4 rounded-xl border border-border bg-background p-4 transition-transform hover:-translate-y-1",
                    action.hoverClassName,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "transition-transform group-hover:scale-110",
                        action.iconClassName,
                      )}
                    >
                      {action.icon}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold">
                      {action.label}
                    </span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {action.description}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className={cn(panelClassName, "rounded-xl bg-card p-6")}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Luồng đang mở
                </p>
                <h3 className="text-2xl font-semibold tracking-tight">
                  Theo dõi trực tiếp
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Giữ mắt ở những bước còn dang dở để tránh tồn việc cuối ca.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Truck className="size-4 text-info" />
                    <span>Điều chuyển</span>
                  </div>
                  <Link
                    href={paths.transfers}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Danh sách
                  </Link>
                </div>
                {activeTransferList.length === 0 ? (
                  <p className="rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
                    Không có phiếu điều chuyển đang vận chuyển.
                  </p>
                ) : (
                  activeTransferList.map((t) => (
                    <Link
                      href={paths.transferDetail(t.id)}
                      key={t.id}
                      className="block rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{t.code}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t.fromBranch} → {t.toBranch}
                          </p>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ClipboardList className="size-4 text-warning" />
                    <span>Kiểm kê</span>
                  </div>
                  <Link
                    href={paths.stocktake}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Danh sách
                  </Link>
                </div>
                {activeStocktakeList.length === 0 ? (
                  <p className="rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
                    Không có phiếu kiểm kê đang thực hiện.
                  </p>
                ) : (
                  activeStocktakeList.map((s) => (
                    <Link
                      href={paths.stocktakeDetail(s.id)}
                      key={s.id}
                      className="block rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {s.branchName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {s.code}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-warning">
                          {s.progress}%
                        </span>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-warning"
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
