"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck as IconCircleCheck, Trash as IconTrash } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import { MobileWasteSheet } from "../../_components/mobile/mobile-waste-sheet";
import type { MobileWasteSheetTarget } from "../../_components/mobile/mobile-waste-sheet";
import { TouchButton } from "../../_components/mobile/touch-button";
import { URGENCY_META } from "../../_lib/constants";
import type { ExpiryAlertRow } from "../../page";

type Filter = "all" | "expired" | "near";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Tất cả",
  expired: "Đã hết hạn",
  near: "Sắp hết hạn",
};

function alertToTarget(alert: ExpiryAlertRow): MobileWasteSheetTarget {
  return {
    ingredientId: alert.ingredient_id,
    ingredientName: alert.ingredient_name,
    branchId: alert.branch_id,
    unit: alert.unit,
    unitCost: alert.unit_cost,
    suggestedQuantity: alert.received_quantity,
    lot: {
      batchNumber: alert.batch_number,
      grnNumber: alert.grn_number,
      expiryDate: new Date(alert.expiry_date).toLocaleDateString("vi-VN"),
    },
  };
}

export function MobileExpiryClient({
  alerts,
  defaultLocationByBranch,
}: {
  alerts: ExpiryAlertRow[];
  defaultLocationByBranch: Record<number, number | null>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [wasteTarget, setWasteTarget] = useState<ExpiryAlertRow | null>(null);

  const counts = useMemo(() => {
    let expired = 0;
    let near = 0;
    for (const a of alerts) {
      if (a.urgency === "expired") expired++;
      else near++;
    }
    return { expired, near, total: alerts.length };
  }, [alerts]);

  const filtered = useMemo(() => {
    if (filter === "expired") {
      return alerts.filter((a) => a.urgency === "expired");
    }
    if (filter === "near") {
      return alerts.filter((a) => a.urgency !== "expired");
    }
    return alerts;
  }, [alerts, filter]);

  function handleComplete() {
    setWasteTarget(null);
    router.refresh();
  }

  return (
    <MobilePage>
      <MobileSectionHeader
        eyebrow="Hạn dùng"
        title="Cận hạn / Đã hết hạn"
        description={
          counts.total === 0
            ? "Tất cả nguyên liệu còn trong hạn."
            : `${counts.expired} đã hết hạn · ${counts.near} cận hạn`
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition",
              filter === key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={IconCircleCheck}
          title="Không có lô cần xử lý"
          description="Hết hạn hoặc cận hạn đều rỗng theo bộ lọc hiện tại."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((alert) => {
            const meta = URGENCY_META[alert.urgency] ?? {
              label: alert.urgency,
              className: "bg-muted text-muted-foreground",
            };
            return (
              <li
                key={alert.id}
                className="flex flex-col gap-2 border bg-card px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">
                      {alert.ingredient_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Lô: {alert.batch_number ?? "—"} · GRN: {alert.grn_number}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nhập ban đầu:{" "}
                      <span className="font-mono tabular-nums">
                        {alert.received_quantity}
                      </span>{" "}
                      {alert.unit} · {alert.branch_name}
                    </p>
                  </div>
                  <Badge className={cn("shrink-0 text-xs", meta.className)}>
                    {alert.urgency === "expired"
                      ? "Đã hết hạn"
                      : `${alert.days_remaining} ngày`}
                  </Badge>
                </div>
                <TouchButton
                  type="button"
                  variant="destructive"
                  fullWidth={false}
                  className="self-end"
                  onClick={() => setWasteTarget(alert)}
                >
                  <IconTrash className="size-4" />
                  Hao hụt
                </TouchButton>
              </li>
            );
          })}
        </ul>
      )}

      <MobileWasteSheet
        open={wasteTarget != null}
        onOpenChange={(open) => {
          if (!open) setWasteTarget(null);
        }}
        target={wasteTarget ? alertToTarget(wasteTarget) : null}
        locationId={
          wasteTarget != null
            ? (defaultLocationByBranch[wasteTarget.branch_id] ?? null)
            : null
        }
        onComplete={handleComplete}
      />
    </MobilePage>
  );
}
