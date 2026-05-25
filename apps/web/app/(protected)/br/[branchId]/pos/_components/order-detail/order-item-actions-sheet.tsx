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
import {
  Check as IconCheck,
  Flame as IconFlame,
  Minus as IconMinus,
  Pencil as IconPencil,
  X as IconX,
} from "lucide-react";
import {
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../../types";
import { PosLineItemCompact } from "../pos-line-item-compact";
import type { OrderItemRowData } from "./order-item-row";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
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
  onReduceRequest: (itemId: number) => void;
  /** Mở "Sửa món" flow — chỉ available khi status='pending' (chef chưa làm)
   * và parent supply menu lookup. Optional vì caller cũ (employee waiter
   * portal) chưa cần đến. */
  onEditRequest?: (itemId: number) => void;
  onPriorityRequest?: (itemId: number, next: boolean) => void;
}

export function OrderItemActionsSheet({
  item,
  canManage,
  isPending,
  onClose,
  onMarkServed,
  onVoidRequest,
  onReduceRequest,
  onEditRequest,
  onPriorityRequest,
}: OrderItemActionsSheetProps) {
  const cancelled = item?.status === "cancelled";
  const served = item?.status === "served";
  const actionable =
    item != null &&
    !cancelled &&
    ["pending", "preparing", "ready"].includes(item.status);
  const canVoid = canManage && actionable;
  const canMarkServed = actionable && !served;
  // Reduce gates on canManage + qty>=2 + actionable. qty=1 means there's
  // nothing to reduce — force the cashier into "Hủy món" so KDS card flips
  // cancelled instead of leaving a zombie qty=0 row.
  const canReduce = canManage && actionable && (item?.quantity ?? 0) >= 2;
  // Edit gates strictly on status='pending' — mirror server RPC. Khi chef
  // đã chuyển preparing/ready, đổi variant/topping = phí thực phẩm; cashier
  // phải dùng Hủy + Thêm. menu_item_id phải có để parent lookup MenuItem.
  const canEdit =
    canManage &&
    item != null &&
    item.status === "pending" &&
    item.menu_item_id != null &&
    onEditRequest != null;
  const canPrioritize =
    item != null &&
    onPriorityRequest != null &&
    ["pending", "preparing"].includes(item.status);
  const displayName = item ? getPosLineItemDisplayName(item) : "";
  const summary = item
    ? getPosLineItemSummary(item)
    : {
        options: null,
        modifiers: [],
        sides: [],
        note: null,
        isPriority: false,
      };
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
        className="pos-safe-bottom max-h-dvh-80 flex flex-col gap-0 px-0 sm:mx-auto sm:max-w-md"
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
              modifiers={summary.modifiers}
              sides={summary.sides}
              note={summary.note}
              isPriority={summary.isPriority}
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
              size="touch"
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
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                if (item && onEditRequest) onEditRequest(item.id);
              }}
            >
              <IconPencil data-icon="inline-start" />
              Sửa món
            </Button>
          )}
          {canPrioritize && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                if (item && onPriorityRequest) {
                  onPriorityRequest(item.id, item.is_priority !== true);
                }
              }}
            >
              <IconFlame data-icon="inline-start" />
              {item?.is_priority === true ? "Bỏ ưu tiên" : "Ưu tiên bếp"}
            </Button>
          )}
          {canReduce && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                if (item) onReduceRequest(item.id);
              }}
            >
              <IconMinus data-icon="inline-start" />
              Giảm số lượng
            </Button>
          )}
          {canVoid && (
            <Button
              type="button"
              variant="destructive"
              size="touch"
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
          {!canMarkServed &&
            !canVoid &&
            !canReduce &&
            !canEdit &&
            !canPrioritize && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Không có thao tác khả dụng cho món này.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full"
            onClick={onClose}
          >
            {ACTIONS_VI.close}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
