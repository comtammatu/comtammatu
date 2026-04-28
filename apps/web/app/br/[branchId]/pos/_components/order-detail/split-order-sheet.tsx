"use client";

import { useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";
import { getPosLineItemDisplayName } from "../../types";
import type { OrderItemRowData } from "./order-item-row";

import { ACTIONS_VI } from "@comtammatu/shared/messages";

export interface SplitOrderItemPartial {
  itemId: number;
  quantity: number;
}

interface SplitOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string | null;
  tableNumber: number | null;
  /** Toàn bộ items trên đơn nguồn (kể cả `cancelled` — sẽ disable trong UI). */
  items: OrderItemRowData[];
  isPending?: boolean;
  onSubmit: (partials: SplitOrderItemPartial[]) => void;
}

/**
 * Pick an arbitrary number of units off the source order and ship them to
 * a new bill on the SAME table. Per-row stepper (0..row.quantity) instead
 * of an all-or-nothing checkbox so cashier có thể tách "2 Cơm sườn" thành
 * 2 bill mỗi bill 1 phần (most common split flow). UI guards (server
 * enforces too):
 *   - Sum selected quantity ≥ 1
 *   - At least 1 active ROW remains on source after move (Q2 owner
 *     decision: block, don't auto-cancel — cashier should use "Hủy đơn"
 *     if the intent is to clear the table).
 *   - Cancelled items can't be picked (they're out of play).
 *
 * Fully-moved rows flip in place (UPDATE order_items.order_id); partial
 * rows are cloned onto the new order with their portion + kds_tickets
 * mirrored so chef sees both halves immediately via realtime.
 */
export function SplitOrderSheet({
  open,
  onOpenChange,
  orderNumber,
  tableNumber,
  items,
  isPending = false,
  onSubmit,
}: SplitOrderSheetProps) {
  // itemId → quantity to move (0..row.quantity). Missing key = 0.
  const [picks, setPicks] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (open) setPicks(new Map());
  }, [open]);

  const activeItems = useMemo(
    () => items.filter((it) => it.status !== "cancelled"),
    [items],
  );

  const partials = useMemo<SplitOrderItemPartial[]>(
    () =>
      activeItems
        .map((it) => ({ itemId: it.id, quantity: picks.get(it.id) ?? 0 }))
        .filter((p) => p.quantity > 0),
    [activeItems, picks],
  );

  const selectedTotal = useMemo(
    () =>
      activeItems.reduce((sum, it) => {
        const qty = picks.get(it.id) ?? 0;
        return sum + qty * it.unit_price;
      }, 0),
    [activeItems, picks],
  );

  const totalUnitsSelected = useMemo(
    () => partials.reduce((sum, p) => sum + p.quantity, 0),
    [partials],
  );

  // Source must keep ≥1 ACTIVE ROW after move. Only fully-moved rows leave
  // the source (partial moves keep source row with reduced qty). So:
  //   remaining_rows = active_total_rows - count(picks where qty == row.qty)
  const fullyMovedRowCount = useMemo(
    () =>
      activeItems.filter((it) => (picks.get(it.id) ?? 0) === it.quantity)
        .length,
    [activeItems, picks],
  );
  const remainingRows = activeItems.length - fullyMovedRowCount;
  const wouldEmptySource = remainingRows < 1;
  const noneSelected = totalUnitsSelected === 0;
  const canSubmit = !noneSelected && !wouldEmptySource && !isPending;

  const setPickQty = (id: number, max: number, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setPicks((prev) => {
      const map = new Map(prev);
      if (clamped === 0) {
        map.delete(id);
      } else {
        map.set(id, clamped);
      }
      return map;
    });
  };

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(partials);
  };

  const headerSubtitle = [
    tableNumber != null ? `Bàn ${tableNumber}` : null,
    orderNumber ? `#${orderNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-3 py-2.5 text-left sm:px-4">
          <SheetTitle>Tách hóa đơn</SheetTitle>
          <SheetDescription>
            {headerSubtitle ? `${headerSubtitle} · ` : ""}
            Chọn số phần cho từng món để chuyển sang đơn mới cùng bàn. Đơn
            gốc phải giữ lại ít nhất 1 món.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-2 px-3 py-3 sm:px-4">
            {items.map((item) => {
              const isCancelled = item.status === "cancelled";
              const picked = picks.get(item.id) ?? 0;
              const displayName = getPosLineItemDisplayName(item);
              const max = item.quantity;
              const remaining = max - picked;
              return (
                <Item
                  key={item.id}
                  asChild
                  variant="outline"
                  className="px-2.5 py-2"
                  data-disabled={isCancelled || undefined}
                >
                  <li className="flex w-full items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="break-words font-medium leading-snug">
                        {displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.quantity} × {formatVND(item.unit_price)}
                        {isCancelled
                          ? " · đã hủy"
                          : picked > 0
                            ? ` · còn lại đơn gốc: ${remaining}`
                            : ""}
                      </span>
                    </div>
                    <div
                      role="group"
                      aria-label={`Số phần tách của ${displayName}`}
                      className="flex shrink-0 items-center gap-1.5"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Bớt 1 phần"
                        disabled={isCancelled || isPending || picked <= 0}
                        onClick={() => setPickQty(item.id, max, picked - 1)}
                      >
                        <IconMinus />
                      </Button>
                      <output
                        aria-live="polite"
                        className="min-w-8 text-center font-mono text-base font-semibold tabular-nums"
                      >
                        {picked}
                      </output>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Thêm 1 phần"
                        disabled={isCancelled || isPending || picked >= max}
                        onClick={() => setPickQty(item.id, max, picked + 1)}
                      >
                        <IconPlus />
                      </Button>
                    </div>
                  </li>
                </Item>
              );
            })}
          </ul>
        </ScrollArea>

        <SheetFooter className="flex-col gap-2 border-t border-border/60 px-3 py-3 sm:px-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Đã chọn {totalUnitsSelected} phần
              {!noneSelected
                ? ` · còn lại ${remainingRows} món trên đơn gốc`
                : ""}
            </span>
            <span className="font-semibold tabular-nums">
              {formatVND(selectedTotal)}
            </span>
          </div>
          {wouldEmptySource && !noneSelected && (
            <p className="text-xs text-destructive">
              Không thể tách: phải giữ lại ít nhất 1 món trên đơn gốc.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isPending}
              onClick={handleClose}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              Tách thành đơn mới
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
