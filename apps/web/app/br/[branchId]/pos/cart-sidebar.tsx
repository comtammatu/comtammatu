"use client";

import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@comtammatu/ui/components/alert-dialog";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  X,
  Package,
} from "lucide-react";
import type { CartItem, OrderType } from "./types";
import { calcItemSubtotal } from "./types";
import type { BranchTable } from "./page";

interface CartSidebarProps {
  items: CartItem[];
  total: number;
  orderType: OrderType;
  selectedTableId: number | null;
  tables: BranchTable[];
  canSubmit: boolean;
  isSubmitting: boolean;
  onUpdateQuantity: (key: string, delta: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onRequestChangeTable: () => void;
  onSubmitOrder: () => void;
  orderNote: string;
  onOrderNoteChange: (note: string) => void;
}

export function CartSidebar({
  items,
  total,
  orderType,
  selectedTableId,
  tables,
  canSubmit,
  isSubmitting,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderTypeChange,
  onRequestChangeTable,
  onSubmitOrder,
  orderNote,
  onOrderNoteChange,
}: CartSidebarProps) {
  const selectedTableNumber =
    selectedTableId != null
      ? tables.find((t) => t.id === selectedTableId)?.number
      : undefined;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4" />
          <span className="font-semibold">Giỏ hàng</span>
          {items.length > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              {items.reduce((sum, i) => sum + i.quantity, 0)}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="touch-target h-7 text-xs text-muted-foreground"
              >
                <Trash2 className="mr-1 size-3" />
                Xóa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa giỏ hàng?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tất cả {items.length} món sẽ bị xóa khỏi giỏ hàng. Hành động
                  này không thể hoàn tác.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={onClearCart}>
                  Xóa tất cả
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="border-b px-3 py-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Loại đơn
        </p>
        <div
          role="radiogroup"
          aria-label="Loại đơn hàng"
          className="flex gap-1 rounded-lg bg-muted p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={orderType === "dine_in"}
            className={cn(
              "touch-target flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              orderType === "dine_in"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onOrderTypeChange("dine_in")}
          >
            <UtensilsCrossed className="size-3.5" />
            Tại bàn
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={orderType === "takeaway"}
            className={cn(
              "touch-target flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              orderType === "takeaway"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onOrderTypeChange("takeaway")}
          >
            <Package className="size-3.5" />
            Mang về
          </button>
        </div>
      </div>

      {orderType === "dine_in" && selectedTableNumber != null && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Bàn phục vụ
            </p>
            <p className="truncate text-sm font-semibold">
              Bàn {selectedTableNumber}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            type="button"
            onClick={onRequestChangeTable}
          >
            Đổi bàn
          </Button>
        </div>
      )}

      {/* Cart items */}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
          <ShoppingCart className="size-10 opacity-30" />
          <p className="text-sm">Chưa có món</p>
          <p className="text-xs">Chọn món từ menu bên trái.</p>
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
                    className="rounded-xl border border-border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold leading-snug">
                          {item.item_name}
                        </p>
                        {item.variant_name && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.variant_name}
                          </p>
                        )}
                        {item.modifiers.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            + {item.modifiers.map((m) => m.name).join(", ")}
                          </p>
                        )}
                        {item.sides.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Kèm: {item.sides.map((s) => s.name).join(", ")}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="touch-target size-7 shrink-0 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Xóa ${item.item_name} khỏi giỏ`}
                        onClick={() => onRemoveItem(item.key)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="touch-target size-11 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label={`Giảm số lượng ${item.item_name}`}
                          onClick={() => onUpdateQuantity(item.key, -1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-9 text-center text-base font-bold tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="touch-target size-11 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label={`Tăng số lượng ${item.item_name}`}
                          onClick={() => onUpdateQuantity(item.key, 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        {formatVND(subtotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t bg-background p-4">
            <div className="space-y-1.5">
              <label
                htmlFor="pos-order-note"
                className="text-xs font-medium text-muted-foreground"
              >
                Ghi chú đơn
              </label>
              <Textarea
                id="pos-order-note"
                value={orderNote}
                onChange={(e) => onOrderNoteChange(e.target.value)}
                placeholder="Ví dụ: ít đường, không hành…"
                maxLength={500}
                rows={2}
                className="resize-none text-sm"
                aria-describedby="pos-order-note-hint"
              />
              <p
                id="pos-order-note-hint"
                className="text-xs text-muted-foreground"
              >
                Tối đa 500 ký tự. Áp dụng cho toàn đơn.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-sm font-semibold text-muted-foreground">
                Tạm tính
              </span>
              <span className="text-xl font-bold text-primary tabular-nums">
                {formatVND(total)}
              </span>
            </div>
            <Button
              className="touch-target-lg mt-3 h-14 w-full text-base font-bold tracking-wide shadow-md"
              size="lg"
              disabled={!canSubmit || isSubmitting}
              onClick={onSubmitOrder}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                "Đặt món"
              )}
            </Button>
            {!canSubmit && items.length > 0 && orderType === "dine_in" && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Vui lòng chọn bàn để đặt món
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
