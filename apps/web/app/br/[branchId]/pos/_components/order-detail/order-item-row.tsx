"use client";

import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { X as IconX } from "lucide-react";
import {
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../../types";
import type { CartModifier, CartSide } from "../../types";
import type { SwipeReveal } from "../../_hooks/use-swipe-reveal";
import { PosLineItemCompact } from "../pos-line-item-compact";

export interface OrderItemRowData {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  status: string;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
}

interface OrderItemRowProps {
  row: OrderItemRowData;
  canManage: boolean;
  onVoid: (itemId: number) => void;
  onMarkServed?: (itemId: number) => void;
  swipe?: SwipeReveal;
}

const ITEM_STATUS_LABELS: Record<
  string,
  {
    label: string;
  }
> = {
  pending: { label: "Chờ" },
  preparing: { label: "Đang làm" },
  ready: { label: "Sẵn sàng" },
  served: { label: "Đã phục vụ" },
  cancelled: { label: "Đã hủy" },
};

function getItemStatusToneClass(status: string): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "border-warning/30 bg-warning/10";
    case "ready":
      return "border-info/30 bg-info/10";
    case "served":
      return "border-success/30 bg-success/10";
    case "cancelled":
      return "border-destructive/30 bg-destructive/10";
    default:
      return "bg-card";
  }
}

export function OrderItemRow({
  row,
  canManage,
  onVoid,
  onMarkServed,
  swipe,
}: OrderItemRowProps) {
  const cancelled = row.status === "cancelled";
  const served = row.status === "served";
  const canVoid =
    canManage &&
    !cancelled &&
    ["pending", "preparing", "ready"].includes(row.status);
  const canMarkServed =
    onMarkServed != null &&
    !cancelled &&
    !served &&
    ["pending", "preparing", "ready"].includes(row.status);
  const revealableActionCount =
    (canMarkServed ? 1 : 0) + (canVoid ? 1 : 0);
  const swipeKey = String(row.id);
  const swipeBindings =
    swipe != null && revealableActionCount > 0
      ? swipe.bindings(swipeKey)
      : null;
  const isRevealed =
    swipe != null &&
    revealableActionCount > 0 &&
    swipe.isRevealed(swipeKey);
  const displayName = getPosLineItemDisplayName(row);
  const statusInfo = ITEM_STATUS_LABELS[row.status] ?? {
    label: row.status,
  };
  const summary = getPosLineItemSummary(row);
  const itemPaddingClass = isRevealed
    ? revealableActionCount === 1
        ? canVoid
          ? "pr-20 sm:pr-14"
          : "pr-20 sm:pr-4"
        : "pr-40 sm:pr-14"
    : canVoid
      ? "pr-12 sm:pr-14"
      : "pr-6 sm:pr-4";

  return (
    <li className="relative w-full min-w-0 max-w-full overflow-hidden">
      {isRevealed && canMarkServed && (
        <Button
          type="button"
          className={cn(
            "absolute inset-y-0 z-10 h-auto min-h-full w-20 rounded-none bg-success text-success-foreground hover:bg-success/90 sm:hidden",
            canVoid ? "right-20" : "right-0",
          )}
          aria-label={`Đánh dấu ${displayName} đã phục vụ`}
          onClick={() => {
            onMarkServed?.(row.id);
            swipe?.setRevealedKey(null);
          }}
        >
          Phục vụ
        </Button>
      )}
      {isRevealed && canVoid && (
        <Button
          type="button"
          variant="destructive"
          className="absolute inset-y-0 right-0 z-10 h-auto min-h-full w-20 rounded-none sm:hidden"
          aria-label={`Hủy ${displayName}`}
          onClick={() => {
            onVoid(row.id);
            swipe?.setRevealedKey(null);
          }}
        >
          Hủy
        </Button>
      )}
      <Item
        variant="outline"
        size="sm"
        className={cn(
          "relative h-20 w-full min-w-0 max-w-full flex-nowrap overflow-hidden touch-pan-y rounded-none py-2 pl-3 shadow-sm transition-colors sm:pl-4",
          getItemStatusToneClass(row.status),
          itemPaddingClass,
          cancelled && "border-dashed",
        )}
        aria-label={`${displayName}, ${statusInfo.label}`}
        onClick={(event) => {
          if (swipe != null && swipe.consumeSuppression(swipeKey)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (isRevealed) swipe?.setRevealedKey(null);
        }}
        {...(swipeBindings ?? {})}
      >
        <PosLineItemCompact
          quantity={row.quantity}
          title={displayName}
          total={formatVND(row.subtotal)}
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
        <span className="sr-only">Trạng thái: {statusInfo.label}</span>
      </Item>
      {canVoid && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 hidden min-h-11 min-w-11 size-9 -translate-y-1/2 text-muted-foreground hover:text-destructive sm:inline-flex"
          aria-label={`Hủy ${displayName}`}
          onClick={(event) => {
            event.stopPropagation();
            onVoid(row.id);
          }}
        >
          <IconX />
        </Button>
      )}
    </li>
  );
}
