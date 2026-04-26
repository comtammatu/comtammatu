"use client";

import { useState } from "react";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Check as IconCheck, X as IconX } from "lucide-react";
import {
  getPosLineItemDisplayName,
  getPosLineItemOptionLines,
} from "../../types";
import type { CartModifier, CartSide } from "../../types";

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
}

const ITEM_STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive" | "success";
  }
> = {
  pending: { label: "Chờ", variant: "outline" },
  preparing: { label: "Đang làm", variant: "secondary" },
  ready: { label: "Sẵn sàng", variant: "default" },
  served: { label: "Đã phục vụ", variant: "success" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

export function OrderItemRow({
  row,
  canManage,
  onVoid,
  onMarkServed,
}: OrderItemRowProps) {
  const [isActionsRevealed, setIsActionsRevealed] = useState(false);
  const [dragged, setDragged] = useState(false);
  const [touchStart, setTouchStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
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
  const isRevealed = isActionsRevealed && revealableActionCount > 0;
  const displayName = getPosLineItemDisplayName(row);
  const statusInfo = ITEM_STATUS_LABELS[row.status] ?? {
    label: row.status,
    variant: "outline" as const,
  };
  const optionLines = getPosLineItemOptionLines(row);

  return (
    <li className="relative overflow-hidden">
      {revealableActionCount > 0 && (
        <div className="absolute inset-y-0 right-0 flex sm:hidden">
          {canMarkServed && (
            <Button
              type="button"
              className="h-auto min-h-full w-20 rounded-none bg-success text-success-foreground hover:bg-success/90"
              aria-label={`Đánh dấu ${displayName} đã phục vụ`}
              onClick={() => {
                onMarkServed?.(row.id);
                setIsActionsRevealed(false);
              }}
            >
              Phục vụ
            </Button>
          )}
          {canVoid && (
            <Button
              type="button"
              variant="destructive"
              className="h-auto min-h-full w-20 rounded-none"
              aria-label={`Hủy ${displayName}`}
              onClick={() => {
                onVoid(row.id);
                setIsActionsRevealed(false);
              }}
            >
              Hủy
            </Button>
          )}
        </div>
      )}
      <Item
        variant="outline"
        size="xs"
        className={cn(
          "relative items-start bg-card text-sm transition-transform",
          isRevealed && revealableActionCount === 1 && "-translate-x-20 sm:translate-x-0",
          isRevealed && revealableActionCount === 2 && "-translate-x-40 sm:translate-x-0",
          cancelled && "border-dashed bg-muted/40",
          served && "border-success/30 bg-success/5",
        )}
        onClick={() => {
          if (dragged) {
            setDragged(false);
            return;
          }
          if (isActionsRevealed) setIsActionsRevealed(false);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch || revealableActionCount === 0) return;
          setTouchStart({ x: touch.clientX, y: touch.clientY });
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          if (!touch || !touchStart || revealableActionCount === 0) return;
          const deltaX = touch.clientX - touchStart.x;
          const deltaY = touch.clientY - touchStart.y;
          if (Math.abs(deltaX) < Math.abs(deltaY)) return;
          if (Math.abs(deltaX) > 12) setDragged(true);
          if (deltaX < -32) {
            setIsActionsRevealed(true);
          } else if (deltaX > 32) {
            setIsActionsRevealed(false);
          }
        }}
        onTouchEnd={() => setTouchStart(null)}
      >
        <ItemContent className="min-w-0">
          <ItemTitle
            className={cn(
              "max-w-full text-sm",
              cancelled && "line-through opacity-70",
            )}
          >
            <span className="shrink-0 text-muted-foreground tabular-nums">
              x{row.quantity}
            </span>
            {displayName}
          </ItemTitle>
          {optionLines.map((line) => (
            <ItemDescription key={line}>{line}</ItemDescription>
          ))}
          <ItemDescription>{formatVND(row.subtotal)}</ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0 self-start">
          <Badge variant={statusInfo.variant} className="gap-1">
            {served && <IconCheck className="size-3" aria-hidden="true" />}
            {statusInfo.label}
          </Badge>
          {canVoid && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden min-h-11 min-w-11 size-9 text-muted-foreground hover:text-destructive sm:inline-flex"
              aria-label={`Hủy ${displayName}`}
              onClick={(event) => {
                event.stopPropagation();
                onVoid(row.id);
              }}
            >
              <IconX />
            </Button>
          )}
        </ItemActions>
      </Item>
    </li>
  );
}
