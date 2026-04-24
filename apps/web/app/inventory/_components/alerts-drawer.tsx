"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import {
  IconAlertTriangle,
  IconAlertOctagon,
  IconAlertCircle,
} from "@tabler/icons-react";
import {
  getInventoryAlerts,
  type DashboardAlert,
} from "../dashboard-actions";

type AlertType = DashboardAlert["alertType"];

const ALERT_KIND_VI: Record<AlertType, string> = {
  negative_stock: "Tồn âm",
  out_of_stock: "Hết hàng",
  low_stock: "Tồn thấp",
};

const TYPE_FILTERS: Array<{ key: AlertType; label: string }> = [
  { key: "negative_stock", label: "Tồn âm" },
  { key: "out_of_stock", label: "Hết hàng" },
  { key: "low_stock", label: "Tồn thấp" },
];

interface AlertsDrawerProps {
  branchId: number;
  /** Initial alerts from dashboard summary to show before user opens drawer. */
  initial?: DashboardAlert[];
  /** Pre-existing alerts count for trigger badge. */
  alertsCount?: number;
  triggerLabel?: string;
  className?: string;
}

/**
 * Right-side drawer listing all inventory alerts for a branch (S12).
 * Paginated via getInventoryAlerts server action. Filters by severity type.
 */
export function AlertsDrawer({
  branchId,
  initial = [],
  alertsCount,
  triggerLabel = "Xem tất cả alert",
  className,
}: AlertsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<DashboardAlert[]>(initial);
  const [types, setTypes] = useState<AlertType[]>([
    "negative_stock",
    "out_of_stock",
    "low_stock",
  ]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, startLoad] = useTransition();

  const PAGE = 50;

  function fetchPage(resetOffset: boolean, nextTypes: AlertType[]) {
    startLoad(async () => {
      const nextOffset = resetOffset ? 0 : offset;
      const res = await getInventoryAlerts({
        branchId,
        types: nextTypes,
        limit: PAGE,
        offset: nextOffset,
      });
      if (!res.success || !res.data) return;
      setAlerts((prev) =>
        resetOffset ? res.data! : [...prev, ...(res.data as DashboardAlert[])],
      );
      setHasMore((res.data as DashboardAlert[]).length === PAGE);
      setOffset(nextOffset + (res.data as DashboardAlert[]).length);
    });
  }

  // Re-fetch when drawer opens OR filter changes.
  // `fetchPage` and `offset` intentionally excluded — those are state-derived
  // and would cause infinite loop; we always want reset-on-open / reset-on-filter-change.
  useEffect(() => {
    if (!open) return;
    fetchPage(true, types);
  }, [open, types, fetchPage]);

  function toggleType(t: AlertType) {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  const effectiveCount = alertsCount ?? alerts.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)}>
          <IconAlertTriangle className="size-4" />
          {triggerLabel}
          {effectiveCount > 0 ? (
            <Badge variant="destructive">{effectiveCount}</Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Inventory alerts — CN #{branchId}</SheetTitle>
          <SheetDescription>
            Ưu tiên tồn âm → hết hàng → tồn thấp.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 py-3">
          {/* Type filter chips */}
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((f) => {
              const active = types.includes(f.key);
              return (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => toggleType(f.key)}
                >
                  {f.label}
                </Button>
              );
            })}
          </div>

          {/* List */}
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : alerts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Không có alert phù hợp bộ lọc.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <AlertRow key={`${a.ingredientId}-${a.locationId}`} alert={a} />
              ))}
            </ul>
          )}

          {hasMore && alerts.length >= PAGE ? (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchPage(false, types)}
                disabled={loading}
              >
                {loading ? <Spinner /> : "Tải thêm"}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const tone = alertTone(alert.alertType);
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm",
        tone.wrap,
      )}
      data-alert-type={alert.alertType}
    >
      <div className={cn("mt-0.5", tone.icon)}>
        {alert.alertType === "negative_stock" ? (
          <IconAlertOctagon className="size-5" />
        ) : alert.alertType === "out_of_stock" ? (
          <IconAlertTriangle className="size-5" />
        ) : (
          <IconAlertCircle className="size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{alert.ingredientName}</div>
            <div className="text-xs text-muted-foreground truncate">
              {alert.locationName} • {ALERT_KIND_VI[alert.alertType]}
            </div>
          </div>
          <Badge variant="outline" className={cn("shrink-0", tone.badge)}>
            {Math.round(alert.shortageRatio * 100)}%
          </Badge>
        </div>
        <div className="mt-1 text-xs tabular-nums">
          Tồn: <span className="font-medium">{alert.currentQuantity}</span>
          {alert.reorderPoint !== null ? (
            <>
              {" / ngưỡng "}
              <span>{alert.reorderPoint}</span>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function alertTone(t: AlertType) {
  switch (t) {
    case "negative_stock":
      return {
        wrap: "border-red-300 bg-red-50",
        icon: "text-red-600",
        badge: "border-red-300 text-red-900",
      };
    case "out_of_stock":
      return {
        wrap: "border-orange-300 bg-orange-50",
        icon: "text-orange-600",
        badge: "border-orange-300 text-orange-900",
      };
    default:
      return {
        wrap: "border-yellow-200 bg-yellow-50/60",
        icon: "text-yellow-700",
        badge: "border-yellow-300 text-yellow-900",
      };
  }
}
