"use client";

import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import type { CartItem } from "./types";
import { calcItemSubtotal } from "./types";

interface CartSidebarProps {
  items: CartItem[];
  total: number;
  onUpdateQuantity: (key: string, delta: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  formatVnd: (amount: number) => string;
}

export function CartSidebar({
  items,
  total,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  formatVnd,
}: CartSidebarProps) {
  return (
    <div className="flex w-[320px] shrink-0 flex-col border-l bg-background lg:w-[360px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4" />
          <span className="font-semibold">Giỏ hàng</span>
          {items.length > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
              {items.reduce((sum, i) => sum + i.quantity, 0)}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={onClearCart}
          >
            <Trash2 className="mr-1 size-3" />
            Xóa
          </Button>
        )}
      </div>

      {/* Cart items */}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <ShoppingCart className="size-10 opacity-30" />
          <p className="text-sm">Chưa có món</p>
          <p className="text-xs">Chọn món từ menu bên trái</p>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-2">
              {items.map((item) => {
                const subtotal = calcItemSubtotal(item);
                return (
                  <div
                    key={item.key}
                    className="rounded-md border bg-card p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        {item.variant_name && (
                          <p className="text-xs text-muted-foreground">
                            {item.variant_name}
                          </p>
                        )}
                        {item.modifiers.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            + {item.modifiers.map((m) => m.name).join(", ")}
                          </p>
                        )}
                        {item.sides.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Kèm: {item.sides.map((s) => s.name).join(", ")}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveItem(item.key)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => onUpdateQuantity(item.key, -1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => onUpdateQuantity(item.key, 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatVnd(subtotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t p-4">
            <Separator className="mb-3" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tạm tính</span>
              <span className="text-lg font-bold text-primary">
                {formatVnd(total)}
              </span>
            </div>
            <Button className="mt-3 w-full" size="lg" disabled>
              Đặt món (M2-S4)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
