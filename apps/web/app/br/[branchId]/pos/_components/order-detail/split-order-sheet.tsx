"use client";

import { useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
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
import { getPosLineItemDisplayName } from "../../types";
import type { OrderItemRowData } from "./order-item-row";

interface SplitOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string | null;
  tableNumber: number | null;
  /** Toàn bộ items trên đơn nguồn (kể cả `cancelled` — sẽ disable trong UI). */
  items: OrderItemRowData[];
  isPending?: boolean;
  onSubmit: (selectedItemIds: number[]) => void;
}

/**
 * Pick 1+ items off the source order and ship them to a new bill on the
 * SAME table. UI guards (server enforces too):
 *   - At least 1 selected
 *   - At least 1 active item REMAINS on source (Q2 owner decision: block,
 *     don't auto-cancel — cashier should use "Hủy đơn" if the intent is
 *     to clear the table).
 *   - Cancelled items can't be picked (they're out of play).
 *
 * Items move in-place at the DB level (kds_tickets follow), so we don't
 * reprint kitchen tickets and chef sees the new order immediately via
 * realtime. UX message reinforces this so cashier doesn't expect paper.
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
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const activeItems = useMemo(
    () => items.filter((it) => it.status !== "cancelled"),
    [items],
  );

  const selectedActiveIds = useMemo(
    () => activeItems.filter((it) => selected.has(it.id)).map((it) => it.id),
    [activeItems, selected],
  );

  const selectedTotal = useMemo(
    () =>
      activeItems
        .filter((it) => selected.has(it.id))
        .reduce((sum, it) => sum + it.subtotal, 0),
    [activeItems, selected],
  );

  const remainingCount = activeItems.length - selectedActiveIds.length;
  const wouldEmptySource = remainingCount < 1;
  const noneSelected = selectedActiveIds.length === 0;
  const canSubmit = !noneSelected && !wouldEmptySource && !isPending;

  const handleToggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(selectedActiveIds);
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
            Chọn món để chuyển sang đơn mới cùng bàn. Đơn gốc phải giữ lại ít
            nhất 1 món.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-2 px-3 py-3 sm:px-4">
            {items.map((item) => {
              const isCancelled = item.status === "cancelled";
              const isChecked = selected.has(item.id);
              const displayName = getPosLineItemDisplayName(item);
              return (
                <Item
                  key={item.id}
                  asChild
                  variant="outline"
                  className="px-2.5 py-2"
                  data-disabled={isCancelled || undefined}
                >
                  <li>
                    <label className="flex w-full cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={isChecked}
                        disabled={isCancelled || isPending}
                        onCheckedChange={() => handleToggle(item.id)}
                        className="mt-0.5"
                        aria-label={`Chọn ${displayName}`}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="break-words font-medium leading-snug">
                          {displayName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.quantity} × {formatVND(item.unit_price)}
                          {isCancelled ? " · đã hủy" : ""}
                        </span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                        {formatVND(item.subtotal)}
                      </span>
                    </label>
                  </li>
                </Item>
              );
            })}
          </ul>
        </ScrollArea>

        <SheetFooter className="flex-col gap-2 border-t border-border/60 px-3 py-3 sm:px-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Đã chọn {selectedActiveIds.length} món
              {!noneSelected ? ` · còn lại ${remainingCount} món trên đơn gốc` : ""}
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
              Hủy
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
