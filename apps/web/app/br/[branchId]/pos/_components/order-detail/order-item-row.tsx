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
import { X as IconX } from "lucide-react";
import { getPosLineItemDisplayName } from "../../types";
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

export function OrderItemRow({ row, canManage, onVoid }: OrderItemRowProps) {
  const [isDeleteRevealed, setIsDeleteRevealed] = useState(false);
  const [dragged, setDragged] = useState(false);
  const [touchStart, setTouchStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const cancelled = row.status === "cancelled";
  const canVoid =
    canManage &&
    !cancelled &&
    ["pending", "preparing", "ready"].includes(row.status);
  const displayName = getPosLineItemDisplayName(row);
  const statusInfo = ITEM_STATUS_LABELS[row.status] ?? {
    label: row.status,
    variant: "outline" as const,
  };
  const lineDetails = [
    row.modifiers.map((m) => `+ ${m.name}`).join(","),
    row.sides.length > 0
      ? row.sides
          .map((s) => (s.quantity > 1 ? `${s.name} x${s.quantity}` : s.name))
          .join(",")
      : "",
    row.note ? `* ${row.note}` : "",
  ].filter(Boolean);

  return (
    <li className="relative overflow-hidden">
      {canVoid && (
        <Button
          type="button"
          variant="destructive"
          className="absolute inset-y-0 right-0 h-auto min-h-full w-20 sm:hidden"
          aria-label={`Hủy ${displayName}`}
          onClick={() => {
            onVoid(row.id);
            setIsDeleteRevealed(false);
          }}
        >
          Hủy
        </Button>
      )}
      <Item
        variant="outline"
        size="xs"
        className={cn(
          "relative items-start bg-card text-sm transition-transform",
          isDeleteRevealed && canVoid && "-translate-x-20 sm:translate-x-0",
          cancelled && "border-dashed bg-muted/40",
        )}
        onClick={() => {
          if (dragged) {
            setDragged(false);
            return;
          }
          if (isDeleteRevealed) setIsDeleteRevealed(false);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch || !canVoid) return;
          setTouchStart({ x: touch.clientX, y: touch.clientY });
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          if (!touch || !touchStart || !canVoid) return;
          const deltaX = touch.clientX - touchStart.x;
          const deltaY = touch.clientY - touchStart.y;
          if (Math.abs(deltaX) < Math.abs(deltaY)) return;
          if (Math.abs(deltaX) > 12) setDragged(true);
          if (deltaX < -32) {
            setIsDeleteRevealed(true);
          } else if (deltaX > 32) {
            setIsDeleteRevealed(false);
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
          {lineDetails.length > 0 && (
            <ItemDescription>{lineDetails.join(" ·")}</ItemDescription>
          )}
          <ItemDescription>{formatVND(row.subtotal)}</ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0 self-start">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          {canVoid && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden text-muted-foreground hover:text-destructive sm:inline-flex"
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
