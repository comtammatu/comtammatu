"use client";

import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Check as IconCheck, X as IconX } from "lucide-react";
import {
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../../types";
import { PosLineItemCompact } from "../pos-line-item-compact";
import type { OrderItemRowData } from "./order-item-row";

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ",
  preparing: "Đang làm",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  cancelled: "Đã hủy",
};

interface OrderItemActionsSheetProps {
  item: OrderItemRowData | null;
  canManage: boolean;
  isPending: boolean;
  onClose: () => void;
  onMarkServed: (itemId: number) => void;
  onVoidRequest: (itemId: number) => void;
}

export function OrderItemActionsSheet({
  item,
  canManage,
  isPending,
  onClose,
  onMarkServed,
  onVoidRequest,
}: OrderItemActionsSheetProps) {
  const cancelled = item?.status === "cancelled";
  const served = item?.status === "served";
  const actionable =
    item != null &&
    !cancelled &&
    ["pending", "preparing", "ready"].includes(item.status);
  const canVoid = canManage && actionable;
  const canMarkServed = actionable && !served;
  const displayName = item ? getPosLineItemDisplayName(item) : "";
  const summary = item
    ? getPosLineItemSummary(item)
    : { options: null, note: null };
  const statusLabel = item
    ? (STATUS_LABELS[item.status] ?? item.status)
    : "";

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex max-h-[80vh] flex-col gap-0 px-0 pb-[env(safe-area-inset-bottom)] sm:mx-auto sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-3 py-2.5 text-left sm:px-4">
          <SheetTitle className="text-base">Thao tác món</SheetTitle>
          <SheetDescription className="sr-only">
            Đánh dấu đã phục vụ hoặc hủy món được chọn
          </SheetDescription>
        </SheetHeader>
        {item && (
          <div className="border-b border-border/60 px-3 py-3 sm:px-4">
            <PosLineItemCompact
              quantity={item.quantity}
              title={displayName}
              total={formatVND(item.subtotal)}
              options={summary.options}
              note={summary.note}
              quantityClassName={cancelled ? "opacity-50" : undefined}
              titleClassName={cancelled ? "line-through opacity-60" : undefined}
              totalClassName={
                cancelled
                  ? "text-muted-foreground line-through opacity-60"
                  : undefined
              }
              optionsClassName={cancelled ? "line-through opacity-60" : undefined}
              noteClassName={cancelled ? "line-through opacity-60" : undefined}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Trạng thái:{" "}
              <span className="font-medium text-foreground">
                {statusLabel}
              </span>
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
          {canMarkServed && (
            <Button
              type="button"
              size="lg"
              className="w-full bg-success text-success-foreground hover:bg-success/90"
              disabled={isPending}
              onClick={() => {
                if (item) onMarkServed(item.id);
              }}
            >
              <IconCheck data-icon="inline-start" />
              Đã phục vụ
            </Button>
          )}
          {canVoid && (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                if (item) onVoidRequest(item.id);
              }}
            >
              <IconX data-icon="inline-start" />
              Hủy món
            </Button>
          )}
          {!canMarkServed && !canVoid && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Không có thao tác khả dụng cho món này.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onClose}
          >
            Đóng
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
