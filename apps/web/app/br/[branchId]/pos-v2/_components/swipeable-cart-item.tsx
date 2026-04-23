"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";
import type { CartItem } from "../../pos/types";
import { calcItemSubtotal } from "../../pos/types";
import { useSwipeReveal } from "../_lib/use-swipe-reveal";

interface SwipeableCartItemProps {
  item: CartItem;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}

export function SwipeableCartItem({
  item,
  onIncrement,
  onDecrement,
  onRemove,
}: SwipeableCartItemProps) {
  const subtotal = calcItemSubtotal(item);
  const swipe = useSwipeReveal({
    direction: "left",
    threshold: 48,
    revealWidth: 88,
  });

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      role="listitem"
    >
      <div className="absolute inset-y-0 right-0 flex w-22 items-center justify-center bg-destructive/15">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="gap-1.5"
          onClick={() => {
            swipe.close();
            onRemove();
          }}
          aria-label={`Xóa ${item.item_name}`}
        >
          <IconTrash className="size-4" />
          Xóa
        </Button>
      </div>

      <div
        {...swipe.handlers}
        className="relative bg-card p-4"
        style={{
          transform: `translateX(${String(swipe.offset)}px)`,
          transition: swipe.isDragging ? "none" : "transform 180ms ease-out",
          touchAction: "pan-y",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <Badge
                variant="warning"
                className="shrink-0 text-sm font-black tabular-nums"
              >
                {item.quantity}x
              </Badge>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">
                  {item.item_name}
                </p>
                {item.variant_name && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.variant_name}
                  </p>
                )}
                {item.modifiers.length > 0 && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    + {item.modifiers.map((m) => m.name).join(", ")}
                  </p>
                )}
                {item.sides.length > 0 && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Kèm: {item.sides.map((s) => s.name).join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className={cn("min-h-11 min-w-11 size-11 rounded-lg")}
              aria-label={`Giảm số lượng ${item.item_name}`}
              onClick={onDecrement}
            >
              <IconMinus className="size-4" />
            </Button>
            <span className="w-10 text-center text-base font-bold tabular-nums">
              {item.quantity}
            </span>
            <Button
              variant="outline"
              size="icon"
              className={cn("min-h-11 min-w-11 size-11 rounded-lg")}
              aria-label={`Tăng số lượng ${item.item_name}`}
              onClick={onIncrement}
            >
              <IconPlus className="size-4" />
            </Button>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Thành tiền
            </p>
            <p className="text-base font-bold text-primary">
              {formatVND(subtotal)}
            </p>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">
          Vuốt sang trái để xóa
        </p>
      </div>
    </div>
  );
}
