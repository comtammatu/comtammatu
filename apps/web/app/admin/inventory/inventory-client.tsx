"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Package,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import type { ReorderAlertRow, ExpiryAlertRow } from "./page";
import type { InTransitTransfer } from "./report-actions";

interface ActiveStocktake {
  id: number;
  branchName: string;
}

interface InventoryDashboardProps {
  reorderAlerts: ReorderAlertRow[];
  expiryAlerts: ExpiryAlertRow[];
  inTransitTransfers: InTransitTransfer[];
  activeStocktakes: ActiveStocktake[];
  showProcurement: boolean;
}

export function InventoryDashboard({
  reorderAlerts,
  expiryAlerts,
  inTransitTransfers,
  activeStocktakes,
  showProcurement,
}: InventoryDashboardProps) {
  const expiredCount = expiryAlerts.filter(
    (a) => a.urgency === "expired",
  ).length;
  const nearExpiryCount = expiryAlerts.filter(
    (a) => a.urgency === "critical" || a.urgency === "warning",
  ).length;

  // Build task list from real data
  const tasks: Array<{
    key: string;
    icon: React.ElementType;
    label: string;
    count: number;
    href: string;
    color: string;
  }> = [];

  if (reorderAlerts.length > 0) {
    tasks.push({
      key: "reorder",
      icon: ShoppingCart,
      label: "nguyên liệu cần đặt hàng",
      count: reorderAlerts.length,
      href: showProcurement
        ? "/admin/inventory/receiving"
        : "/admin/inventory/stock",
      color: "text-warning",
    });
  }

  if (inTransitTransfers.length > 0) {
    tasks.push({
      key: "transit",
      icon: Truck,
      label: "phiếu chuyển kho chờ nhận",
      count: inTransitTransfers.length,
      href: "/admin/inventory/transfers?status=in_transit",
      color: "text-blue-600",
    });
  }

  if (expiryAlerts.length > 0) {
    tasks.push({
      key: "expiry",
      icon: Clock,
      label:
        expiredCount > 0 ? "mặt hàng hết/sắp hết hạn" : "mặt hàng sắp hết hạn",
      count: expiryAlerts.length,
      href: "/inventory/settings/expiry",
      color: expiredCount > 0 ? "text-destructive" : "text-warning",
    });
  }

  if (activeStocktakes.length > 0) {
    tasks.push({
      key: "stocktake",
      icon: ClipboardCheck,
      label: "phiên kiểm kê đang thực hiện",
      count: activeStocktakes.length,
      href:
        activeStocktakes.length === 1
          ? `/admin/inventory/stocktake/${String(activeStocktakes[0]?.id)}`
          : "/admin/inventory/stocktake",
      color: "text-primary",
    });
  }

  return (
    <div className="space-y-6">
      {/* Alert Dashboard Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Reorder Alerts Card */}
        <Link
          href={
            showProcurement
              ? "/admin/inventory/receiving"
              : "/admin/inventory/stock"
          }
        >
          <Card
            className={cn(
              "transition-shadow hover:shadow-md",
              reorderAlerts.length > 0
                ? "border-warning bg-warning/5"
                : "border-success bg-success/5",
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {reorderAlerts.length > 0 ? (
                  <ShoppingCart className="mt-0.5 size-5 shrink-0 text-warning" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">Cần đặt hàng</h3>
                  {reorderAlerts.length > 0 ? (
                    <>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {reorderAlerts.length} nguyên liệu dưới mức đặt hàng
                      </p>
                      <ul className="mt-2 space-y-1">
                        {reorderAlerts.slice(0, 3).map((alert) => (
                          <li
                            key={`${String(alert.ingredient_id)}-${String(alert.branch_id)}`}
                            className="truncate text-sm"
                          >
                            <span className="font-medium">
                              {alert.ingredient_name}
                            </span>
                            :{" "}
                            <span className="tabular-nums">
                              {alert.current_quantity}/{alert.reorder_point}
                            </span>{" "}
                            {alert.unit}
                          </li>
                        ))}
                        {reorderAlerts.length > 3 && (
                          <li className="text-sm text-muted-foreground">
                            ...và {reorderAlerts.length - 3} nguyên liệu khác
                          </li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tồn kho đủ cho tất cả nguyên liệu
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Expiry Alerts Card */}
        <Link href="/inventory/settings/expiry">
          <Card
            className={cn(
              "transition-shadow hover:shadow-md",
              expiredCount > 0
                ? "border-destructive bg-destructive/5"
                : nearExpiryCount > 0
                  ? "border-warning bg-warning/5"
                  : "border-success bg-success/5",
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {expiryAlerts.length > 0 ? (
                  <Clock
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      expiredCount > 0 ? "text-destructive" : "text-warning",
                    )}
                  />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">Hạn sử dụng</h3>
                  {expiryAlerts.length > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {expiredCount > 0 && `${String(expiredCount)} hết hạn`}
                      {expiredCount > 0 && nearExpiryCount > 0 && ", "}
                      {nearExpiryCount > 0 &&
                        `${String(nearExpiryCount)} sắp hết hạn`}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Không có hàng sắp hết hạn
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* In-Transit Card */}
        <Link href="/admin/inventory/transfers?status=in_transit">
          <Card
            className={cn(
              "transition-shadow hover:shadow-md",
              inTransitTransfers.length > 0
                ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                : "border-success bg-success/5",
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Truck
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    inTransitTransfers.length > 0
                      ? "text-blue-600"
                      : "text-success",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">Đang vận chuyển</h3>
                  {inTransitTransfers.length > 0 ? (
                    <>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {inTransitTransfers.length} phiếu đang trên đường
                      </p>
                      <ul className="mt-2 space-y-1">
                        {inTransitTransfers.slice(0, 3).map((t) => (
                          <li key={t.id} className="truncate text-sm">
                            <span className="font-mono font-medium">
                              {t.transfer_number}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {t.from_branch_name} → {t.to_branch_name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Không có hàng đang vận chuyển
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Việc cần làm hôm nay */}
      {tasks.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold">
              Việc cần làm hôm nay
            </h3>
            <div className="divide-y">
              {tasks.map((task) => {
                const Icon = task.icon;
                return (
                  <Link
                    key={task.key}
                    href={task.href}
                    className="flex items-center gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:text-foreground"
                  >
                    <Icon className={cn("size-5 shrink-0", task.color)} />
                    <span className="flex-1 text-sm">
                      <span className="font-semibold tabular-nums">
                        {task.count}
                      </span>{" "}
                      {task.label}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-success bg-success/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-success" />
              <div>
                <h3 className="font-semibold">Mọi thứ ổn!</h3>
                <p className="text-sm text-muted-foreground">
                  Không có cảnh báo hay việc cần xử lý ngay
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick navigation */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickNavCard
          href="/admin/inventory/stock"
          icon={Package}
          label="Tồn kho"
        />
        <QuickNavCard
          href="/admin/inventory/transfers"
          icon={Truck}
          label="Luân chuyển"
        />
        <QuickNavCard
          href="/admin/inventory/stocktake"
          icon={ClipboardCheck}
          label="Kiểm kê"
        />
        {showProcurement && (
          <QuickNavCard
            href="/admin/inventory/receiving"
            icon={ShoppingCart}
            label="Nhập kho"
          />
        )}
      </div>
    </div>
  );
}

function QuickNavCard({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 py-4">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
