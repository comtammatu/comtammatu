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
import { Separator } from "@comtammatu/ui/components/separator";
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
  onTableSelect: (tableId: number | null) => void;
  onSubmitOrder: () => void;
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
  onTableSelect,
  onSubmitOrder,
}: CartSidebarProps) {
  // Group tables by zone
  const tablesByZone = tables.reduce<Map<string, BranchTable[]>>(
    (acc, table) => {
      const zoneName = table.branch_zones?.name ?? "Không có khu vực";
      const group = acc.get(zoneName);
      if (group) {
        group.push(table);
      } else {
        acc.set(zoneName, [table]);
      }
      return acc;
    },
    new Map(),
  );

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
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

      {/* Order type toggle */}
      <div className="border-b px-3 py-2">
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
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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

      {/* Table picker (dine_in only) */}
      {orderType === "dine_in" && (
        <div className="border-b px-3 py-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Chọn bàn
          </p>
          {tables.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Không có bàn nào khả dụng
            </p>
          ) : (
            <ScrollArea className="max-h-[120px]">
              <div className="flex flex-col gap-1.5">
                {Array.from(tablesByZone.entries()).map(
                  ([zoneName, zoneTables]) => (
                    <div key={zoneName}>
                      {tablesByZone.size > 1 && (
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {zoneName}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {zoneTables.map((table) => {
                          const isAvailable = table.status === "available";
                          const isSelected = selectedTableId === table.id;
                          return (
                            <button
                              key={table.id}
                              type="button"
                              disabled={!isAvailable}
                              aria-label={
                                isAvailable
                                  ? `Bàn ${String(table.number)}`
                                  : `Bàn ${String(table.number)} — đang sử dụng`
                              }
                              className={cn(
                                "min-h-10 min-w-10 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : isAvailable
                                    ? "border-border hover:bg-accent"
                                    : "border-border/50 text-muted-foreground/50",
                              )}
                              onClick={() =>
                                onTableSelect(isSelected ? null : table.id)
                              }
                            >
                              {table.number}
                              {!isAvailable && (
                                <span aria-hidden="true" className="ml-0.5 text-xs">●</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

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
                          className="size-10"
                          onClick={() => onUpdateQuantity(item.key, -1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-10"
                          onClick={() => onUpdateQuantity(item.key, 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatVND(subtotal)}
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
                {formatVND(total)}
              </span>
            </div>
            <Button
              className="mt-3 w-full"
              size="lg"
              disabled={!canSubmit || isSubmitting}
              onClick={onSubmitOrder}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                "Đặt món"
              )}
            </Button>
            {!canSubmit && items.length > 0 && orderType === "dine_in" && (
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                Vui lòng chọn bàn để đặt món
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
