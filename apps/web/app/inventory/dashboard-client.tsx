"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  CheckSquare,
  ChefHat,
  ClipboardList,
  Clock,
  Factory,
  Hourglass,
  Lightbulb,
  Package,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Progress } from "@comtammatu/ui/components/progress";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { InventoryHeader } from "./_components/inventory-header";
import { StatusBadge } from "./_components/status-badge";
import { formatVND } from "./_lib/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";
import { tNav, tStatus } from "./_lib/dictionary";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DashboardSiteKind = "central_warehouse" | "central_kitchen" | "branch";

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

/* ------------------------------------------------------------------ */
/*  Quick actions per site kind                                        */
/* ------------------------------------------------------------------ */

function buildQuickActions(
  siteKind: DashboardSiteKind,
  routeBase: InventoryRouteBase,
) {
  const p = getInventoryPaths(routeBase);

  if (siteKind === "central_warehouse")
    return [
      { label: "Nhập nguyên liệu", icon: ShoppingCart, href: p.receiving, primary: true },
      { label: tNav("transfers"), icon: ArrowLeftRight, href: p.transfers },
      { label: tNav("stocktake"), icon: ClipboardList, href: p.stocktake },
      { label: tNav("reports"), icon: BarChart3, href: p.reports },
    ];

  if (siteKind === "central_kitchen")
    return [
      { label: "Tạo lệnh sản xuất", icon: Factory, href: p.production, primary: true },
      { label: "Xuất thành phẩm", icon: Package, href: p.transfers },
      { label: tNav("stocktake"), icon: ClipboardList, href: p.stocktake },
      { label: tNav("reports"), icon: BarChart3, href: p.reports },
    ];

  return [
    { label: "Nhận điều chuyển", icon: Truck, href: p.transfers, primary: true },
    { label: tNav("issues"), icon: ChefHat, href: p.issues },
    { label: tNav("stock"), icon: Package, href: p.stock },
    { label: tNav("stocktake"), icon: ClipboardList, href: p.stocktake },
  ];
}

/* ------------------------------------------------------------------ */
/*  Task / alert builders                                              */
/* ------------------------------------------------------------------ */

function isTransferOpen(status: string) {
  return ["draft", "confirmed", "confirmed_ship", "in_transit", "confirmed_receive"].includes(status);
}

type TaskItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  severity: "destructive" | "warning" | "info" | "success" | "primary";
};

function buildTasks(props: DashboardProps): TaskItem[] {
  const {
    siteKind, siteName, showProcurement, pendingPO,
    activeTransfers, reorderAlerts, expiryAlerts, transfers,
  } = props;
  const paths = getInventoryPaths(props.routeBase);
  const items: TaskItem[] = [];
  const open = transfers.filter((t) => isTransferOpen(t.status));
  const inbound = open.filter((t) => t.toBranch === siteName);
  const outbound = open.filter((t) => t.fromBranch === siteName);

  if (siteKind === "central_warehouse") {
    if (pendingPO > 0)
      items.push({ key: "po", title: `${pendingPO} PO cần theo dõi`, description: "Đẩy nhanh đơn mở trước GRN.", href: paths.purchaseOrders, icon: <ShoppingCart className="size-4" />, severity: "primary" });
    if (outbound.length > 0 || activeTransfers > 0)
      items.push({ key: "tf-out", title: `${outbound.length || activeTransfers} phiếu xuất đang mở`, description: "Theo dõi phiếu rời kho HQ.", href: paths.transfers, icon: <Truck className="size-4" />, severity: "info" });
  }

  if (siteKind === "central_kitchen") {
    items.push({ key: "ck", title: "Chốt nhịp sản xuất", description: "Tạo/xác nhận lệnh sản xuất.", href: paths.production, icon: <Lightbulb className="size-4" />, severity: "primary" });
    if (inbound.length > 0 || outbound.length > 0)
      items.push({ key: "ck-tf", title: `${inbound.length || outbound.length} phiếu cần theo dõi`, description: "Nhận NL hoặc xuất TP.", href: paths.transfers, icon: <Truck className="size-4" />, severity: "info" });
  }

  if (siteKind === "branch") {
    if (inbound.length > 0)
      items.push({ key: "recv", title: `${inbound.length} phiếu đến cần xác nhận`, description: "Nhận hàng nội bộ.", href: paths.transfers, icon: <Truck className="size-4" />, severity: "primary" });
    items.push({ key: "kitchen", title: "Cấp bếp theo nhịp bán", description: "Ghi nhận cấp phát kitchen_use.", href: paths.issues, icon: <CheckSquare className="size-4" />, severity: "info" });
  }

  if (props.activeStocktakes > 0)
    items.push({ key: "st", title: `${props.activeStocktakes} phiên kiểm kê đang mở`, description: "Hoàn tất để khóa chênh lệch.", href: paths.stocktake, icon: <ClipboardList className="size-4" />, severity: "success" });
  if (expiryAlerts.length > 0)
    items.push({ key: "exp", title: `${expiryAlerts.length} lô cần xử lý hạn dùng`, description: "Ưu tiên xuất các lô cận hạn.", href: paths.expiry, icon: <Hourglass className="size-4" />, severity: "warning" });
  if (showProcurement && reorderAlerts.length > 0)
    items.push({ key: "reorder", title: `${reorderAlerts.length} nguyên liệu chạm ngưỡng`, description: "Chuẩn bị PO.", href: paths.purchaseOrders, icon: <ShoppingCart className="size-4" />, severity: "destructive" });

  return items.slice(0, 5);
}

const severityDot: Record<string, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  primary: "bg-primary",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardClient(props: DashboardProps) {
  const {
    routeBase, siteName, siteKind, showProcurement,
    totalStockValue, pendingPO, activeTransfers,
    reorderAlerts, expiryAlerts, transfers, stocktakeSessions,
  } = props;

  const isMobile = useIsMobile();
  const paths = getInventoryPaths(routeBase);
  const quickActions = buildQuickActions(siteKind, routeBase);
  const tasks = buildTasks(props);

  const activeTransferList = transfers
    .filter((t) => ["in_transit", "confirmed", "confirmed_ship", "confirmed_receive"].includes(t.status))
    .slice(isMobile ? 2 : 3);
  const activeStocktakeList = stocktakeSessions
    .filter((s) => s.status === "in_progress");

  const siteKindLabel = siteKind === "central_warehouse"
    ? "HQ"
    : siteKind === "central_kitchen"
      ? "Bếp TT"
      : "Chi nhánh";

  return (
    <>
      <InventoryHeader
        title={tNav("home")}
        description={`${siteName} • ${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      <div className="flex-1 overflow-auto p-4">
        <div className={cn("mx-auto space-y-6", isMobile ? "max-w-xl" : "max-w-7xl")}>
          {/* KPI cards */}
          <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
            {[
              { label: "Giá trị tồn kho", value: `${formatVND(totalStockValue)}đ` },
              { label: "PO đang chờ", value: String(pendingPO) },
              { label: "Transfer đang xử lý", value: String(activeTransfers) },
              { label: "Cảnh báo hết hạn", value: String(expiryAlerts.length) },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-4">
                  <p className={cn("text-muted-foreground text-xs")}>{kpi.label}</p>
                  <p className={cn("font-bold tabular-nums", isMobile ? "mt-0.5 text-lg" : "mt-1 text-2xl")}>{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Thao tác nhanh</CardTitle>
              <CardDescription className="text-xs">
                {siteKind === "central_warehouse" && "Các thao tác phổ biến tại trụ sở"}
                {siteKind === "central_kitchen" && "Các thao tác phổ biến tại bếp trung tâm"}
                {siteKind === "branch" && "Các thao tác phổ biến tại chi nhánh"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={cn("flex gap-2", isMobile ? "flex-col" : "flex-wrap")}>
                {quickActions.map((a) => (
                  <Button
                    key={a.label}
                    variant={a.primary ? "default" : "outline"}
                    size={isMobile ? "lg" : "sm"}
                    className={cn(isMobile && "justify-start")}
                    asChild
                  >
                    <Link href={a.href}>
                      <a.icon className="mr-2 size-4" />
                      {a.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tasks + Alerts */}
          <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "lg:grid-cols-2")}>
            {/* Tasks */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Việc cần làm ngay trong ca</CardTitle>
                    <CardDescription className="text-xs">
                      {tasks.length} việc đang chờ xử lý
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="h-6">
                    <Clock className="mr-1 size-3" />
                    {siteKindLabel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Không có việc cần xử lý gấp.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <Link
                        key={task.key}
                        href={task.href}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent active:scale-[0.99]",
                          isMobile && "min-h-14",
                        )}
                      >
                        <div className={cn("mt-1.5 size-2 shrink-0 rounded-full", severityDot[task.severity])} />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium leading-tight">{task.title}</p>
                          <p className="text-xs text-muted-foreground">{task.description}</p>
                        </div>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Cảnh báo và luồng ưu tiên</CardTitle>
                    <CardDescription className="text-xs">Các vấn đề cần chú ý</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={paths.expiry}>Xem tất cả</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reorderAlerts.slice(0, isMobile ? 2 : 3).map((item) => (
                    <Link
                      key={`r-${item.ingredientId}-${item.branchId}`}
                      href={showProcurement ? paths.purchaseOrders : paths.stock}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3 transition-colors hover:bg-accent",
                        isMobile && "min-h-14",
                      )}
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium leading-tight">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Tồn {item.current}{item.unit} / Ngưỡng {item.reorder}{item.unit}
                        </p>
                      </div>
                      <Badge variant="destructive" className="shrink-0 text-xs">Tái đặt</Badge>
                    </Link>
                  ))}
                  {expiryAlerts.slice(0, isMobile ? 2 : 3).map((item) => (
                    <Link
                      key={`e-${item.id}`}
                      href={paths.expiry}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent",
                        item.urgency === "critical" ? "border-destructive/50 bg-destructive/5" : "border-warning/50 bg-warning/5",
                        isMobile && "min-h-14",
                      )}
                    >
                      <AlertTriangle className={cn(
                        "mt-0.5 size-4 shrink-0",
                        item.urgency === "critical" ? "text-destructive" : "text-warning",
                      )} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium leading-tight">
                          {item.ingredientName}{item.lot ? ` • ${item.lot}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.daysLeft <= 0 ? `Quá hạn ${Math.abs(item.daysLeft)} ngày` : `Còn ${item.daysLeft} ngày`}
                        </p>
                      </div>
                      <Badge variant={item.urgency === "critical" ? "destructive" : "warning"} className="shrink-0 text-xs">
                        {item.daysLeft <= 0 ? tStatus("expired", "badge") : tStatus("critical", "badge")}
                      </Badge>
                    </Link>
                  ))}
                  {reorderAlerts.length === 0 && expiryAlerts.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Không có cảnh báo nào.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transfer tracking + Stocktake progress */}
          <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "lg:grid-cols-2")}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Theo dõi điều chuyển</CardTitle>
                    <CardDescription className="text-xs">
                      {activeTransferList.length} phiếu đang xử lý
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={paths.transfers}>Xem tất cả</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activeTransferList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Không có điều chuyển đang xử lý
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeTransferList.map((t) => (
                      <Link
                        key={t.id}
                        href={paths.transferDetail(t.id)}
                        className={cn(
                          "block rounded-lg border p-3 transition-colors hover:bg-accent active:scale-[0.99]",
                          isMobile && "min-h-14",
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">{t.code}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t.fromBranch}</span>
                          <ArrowRight className="size-3" />
                          <span>{t.toBranch}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Tiến độ kiểm kê</CardTitle>
                    <CardDescription className="text-xs">
                      {activeStocktakeList.length} phiên đang thực hiện
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={paths.stocktake}>Xem tất cả</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activeStocktakeList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Không có phiên kiểm kê đang thực hiện
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeStocktakeList.map((s) => (
                      <Link
                        key={s.id}
                        href={paths.stocktakeDetail(s.id)}
                        className={cn(
                          "block rounded-lg border p-3 transition-colors hover:bg-accent active:scale-[0.99]",
                          isMobile && "min-h-14",
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">{s.code}</span>
                          <Badge variant="secondary" className="text-xs">
                            {s.progress}%
                          </Badge>
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">{s.branchName}</p>
                        <Progress value={s.progress} className="h-2" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
