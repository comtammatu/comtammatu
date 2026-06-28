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
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Check as IconCheck,
  CircleDollarSign as IconCircleDollarSign,
  Flame as IconFlame,
  Minus as IconMinus,
  Pencil as IconPencil,
  X as IconX,
} from "lucide-react";
import { getPosLineItemDisplayName, getPosLineItemSummary } from "../../types";
import { PosLineItemCompact } from "../pos-line-item-compact";
import type { OrderItemRowData } from "./order-item-row";

import { ACTIONS_VI, POS_VI } from "@comtammatu/shared/messages";
import { ORDER_ITEM_STATUS_LABELS_VI } from "@comtammatu/shared/labels";

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
  onDiscountRequest?: (itemId: number) => void;
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
  onDiscountRequest,
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
  const canDiscount =
    canManage && actionable && item != null && onDiscountRequest != null;
  // Edit gates strictly on status='pending' — mirrors the server RPC. Once
  // the chef moved to preparing/ready, changing variant/topping wastes food;
  // the cashier must void + re-add. menu_item_id must exist for the parent
  // MenuItem lookup.
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
    ? ((ORDER_ITEM_STATUS_LABELS_VI as Record<string, string>)[item.status] ??
      item.status)
    : "";
  const discountAmount = Math.max(0, Number(item?.discount_amount ?? 0));
  const netSubtotal =
    item == null ? 0 : Math.max(0, item.subtotal - discountAmount);
  const discountLine =
    discountAmount > 0 ? `Chiết khấu món: -${formatVND(discountAmount)}` : null;

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
        className="pos-safe-bottom max-h-dvh-80 gap-0 px-0 sm:mx-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="text-base">{POS_VI.itemActionsTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {POS_VI.itemActionsDescription}
          </SheetDescription>
        </SheetHeader>
        {item && (
          <div className="border-b border-border/60 px-3 py-3 sm:px-4">
            <PosLineItemCompact
              quantity={item.quantity}
              title={displayName}
              total={formatVND(netSubtotal)}
              options={summary.options}
              modifiers={summary.modifiers}
              sides={summary.sides}
              discount={discountLine}
              note={summary.note}
              isPriority={summary.isPriority}
              quantityClassName={cancelled ? "opacity-50" : undefined}
              titleClassName={cancelled ? "line-through opacity-60" : undefined}
              totalClassName={
                cancelled
                  ? "text-muted-foreground line-through opacity-60"
                  : undefined
              }
              optionsClassName={
                cancelled ? "line-through opacity-60" : undefined
              }
              noteClassName={cancelled ? "line-through opacity-60" : undefined}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Trạng thái:{" "}
              <span className="font-medium text-foreground">{statusLabel}</span>
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
              {POS_VI.markServed}
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
              {POS_VI.editItem}
            </Button>
          )}
          {canDiscount && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                if (item && onDiscountRequest) onDiscountRequest(item.id);
              }}
            >
              <IconCircleDollarSign data-icon="inline-start" />
              {discountAmount > 0 ? "Sửa chiết khấu món" : "Chiết khấu món"}
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
              {POS_VI.reduceQuantity}
            </Button>
          )}
          {canVoid && (
            <Separator className="my-1" />
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
              {POS_VI.voidItem}
            </Button>
          )}
          {!canMarkServed &&
            !canVoid &&
            !canReduce &&
            !canEdit &&
            !canDiscount &&
            !canPrioritize && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {POS_VI.noItemActions}
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
