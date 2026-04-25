"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck as IconCircleCheck, Trash as IconTrash } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { cn } from "@comtammatu/ui";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import {
  MobileWasteSheet,
  MobileBulkWasteSheet,
} from "../../_components/mobile/mobile-waste-sheet";
import type { MobileWasteSheetTarget } from "../../_components/mobile/mobile-waste-sheet";
import { MobileBulkActionSheet } from "../../_components/mobile/mobile-bulk-action-sheet";
import { TouchButton } from "../../_components/mobile/touch-button";
import { useInventoryBulkSelection } from "../../_lib/use-inventory-bulk-selection";
import { URGENCY_META, WASTE_TIER_ZERO_VND } from "../../_lib/constants";
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

function lineValue(alert: ExpiryAlertRow): number {
  return alert.received_quantity * (alert.unit_cost ?? 0);
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
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

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

  // Bulk selection runs over the filtered list. The hook auto-shrinks
  // selectedItems as the source list changes (filter chip toggle), which
  // is the desired behavior — selections that no longer match the user's
  // current view drop out.
  const bulkSelection = useInventoryBulkSelection<ExpiryAlertRow>(filtered);

  // Cross-branch guard mirrors the desktop expiry pattern: the canonical
  // create_waste_entry RPC accepts one branch per call, so a selection
  // spanning multiple branches has to refuse the bulk action.
  const selectedBranchIds = useMemo(
    () =>
      new Set(bulkSelection.selectedItems.map((it) => it.branch_id)),
    [bulkSelection.selectedItems],
  );
  const bulkSpansBranches = selectedBranchIds.size > 1;
  const bulkBranchId =
    selectedBranchIds.size === 1
      ? (Array.from(selectedBranchIds)[0] ?? null)
      : null;

  // Tier-0 client filter: lines whose cost*qty hits 150k VND need photo
  // evidence (server raises 42501). Drop them from the bulk submit and
  // surface the count so the user can switch to single-flow if needed.
  const eligibleSelected = useMemo(
    () =>
      bulkSelection.selectedItems.filter(
        (it) => lineValue(it) < WASTE_TIER_ZERO_VND,
      ),
    [bulkSelection.selectedItems],
  );
  const skippedTierCount =
    bulkSelection.selectedCount - eligibleSelected.length;

  function exitSelectMode() {
    bulkSelection.clear();
    setSelectMode(false);
  }

  function handleSingleComplete() {
    setWasteTarget(null);
    router.refresh();
  }

  function handleBulkComplete() {
    setBulkDialogOpen(false);
    exitSelectMode();
    router.refresh();
  }

  const bulkLocationId =
    bulkBranchId != null
      ? (defaultLocationByBranch[bulkBranchId] ?? null)
      : null;
  const bulkTargets = useMemo(
    () => eligibleSelected.map(alertToTarget),
    [eligibleSelected],
  );

  const bulkAction = bulkSpansBranches
    ? "Chỉ chọn 1 chi nhánh"
    : eligibleSelected.length === 0
      ? "Không có lô đủ điều kiện"
      : `Hao hụt ${eligibleSelected.length} lô`;

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

      <div className="flex flex-wrap items-center gap-1.5">
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
        {counts.total > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={selectMode ? "default" : "outline"}
            className="ml-auto"
            onClick={() => {
              if (selectMode) exitSelectMode();
              else setSelectMode(true);
            }}
          >
            {selectMode ? "Xong" : "Chọn nhiều"}
          </Button>
        ) : null}
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
            const isSelected = bulkSelection.isSelected(alert.id);
            const overTier = lineValue(alert) >= WASTE_TIER_ZERO_VND;
            return (
              <li
                key={alert.id}
                className={cn(
                  "flex flex-col gap-2 border bg-card px-3 py-3 transition-colors",
                  selectMode && "cursor-pointer",
                  isSelected && "bg-primary/5 ring-2 ring-primary/40",
                )}
                onClick={() => {
                  if (selectMode) bulkSelection.toggle(alert.id);
                }}
              >
                <div className="flex items-start gap-2">
                  {selectMode ? (
                    <span
                      className="grid size-11 shrink-0 place-items-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(value) =>
                          bulkSelection.setSelected(alert.id, value === true)
                        }
                        aria-label={`Chọn ${alert.ingredient_name}`}
                        className="size-6"
                      />
                    </span>
                  ) : null}
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
                    {selectMode && overTier ? (
                      <Badge variant="warning" className="mt-1 text-xs">
                        Vượt tier 0 — sẽ bỏ qua
                      </Badge>
                    ) : null}
                  </div>
                  <Badge className={cn("shrink-0 text-xs", meta.className)}>
                    {alert.urgency === "expired"
                      ? "Đã hết hạn"
                      : `${alert.days_remaining} ngày`}
                  </Badge>
                </div>
                {selectMode ? null : (
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
                )}
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
        onComplete={handleSingleComplete}
      />

      {selectMode && !bulkDialogOpen ? (
        <MobileBulkActionSheet
          selectedCount={bulkSelection.selectedCount}
          itemNoun="lô hàng"
          onClear={exitSelectMode}
          topSlot={
            skippedTierCount > 0 ? (
              <Badge variant="warning">
                {skippedTierCount} lô vượt tier 0 — sẽ bỏ qua khi gửi
              </Badge>
            ) : null
          }
          actions={[
            {
              key: "bulk-waste",
              label: bulkAction,
              icon: IconTrash,
              variant: "destructive",
              primary: true,
              disabled:
                bulkSpansBranches ||
                bulkBranchId == null ||
                eligibleSelected.length === 0,
              onClick: () => setBulkDialogOpen(true),
            },
          ]}
        />
      ) : null}

      {bulkDialogOpen && bulkBranchId != null ? (
        <MobileBulkWasteSheet
          open={bulkDialogOpen}
          onOpenChange={(open) => {
            if (!open) setBulkDialogOpen(false);
          }}
          targets={bulkTargets}
          branchId={bulkBranchId}
          locationId={bulkLocationId}
          onComplete={handleBulkComplete}
        />
      ) : null}
    </MobilePage>
  );
}
