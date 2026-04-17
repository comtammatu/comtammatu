"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
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
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Progress } from "@comtammatu/ui/components/progress";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import type { CartItem, OrderType } from "./types";
import { calcItemSubtotal } from "./types";
import type { BranchTable } from "./page";

interface CartSidebarProps {
  items: CartItem[];
  total: number;
  orderType: OrderType;
  selectedTableId: number | null;
  tables: BranchTable[];
  progressPercent: number;
  progressHeadline: string;
  progressHint: string;
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
  progressPercent,
  progressHeadline,
  progressHint,
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
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const contextLabel =
    orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chưa chọn bàn";

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="border-b border-border/60 px-4 py-4">
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Đơn mới
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  {progressHeadline}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {progressHint}
                </p>
              </div>
              <div className="rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                {Math.round(progressPercent)}%
              </div>
            </div>

            <ToggleGroup
              type="single"
              value={orderType}
              variant="outline"
              size="lg"
              className="grid w-full grid-cols-2 gap-2"
              onValueChange={(value) => {
                if (value === "dine_in" || value === "takeaway") {
                  onOrderTypeChange(value);
                }
              }}
            >
              <ToggleGroupItem
                value="dine_in"
                className="min-h-11 justify-center gap-2 rounded-lg text-sm font-semibold"
              >
                <UtensilsCrossed className="size-4" />
                Tại bàn
              </ToggleGroupItem>
              <ToggleGroupItem
                value="takeaway"
                className="min-h-11 justify-center gap-2 rounded-lg text-sm font-semibold"
              >
                <Package className="size-4" />
                Mang về
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {contextLabel}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {totalQuantity > 0 ? `${totalQuantity} món` : "Chưa có món"}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {canSubmit ? "Có thể gửi bếp" : "Chờ hoàn thiện thông tin"}
              </Badge>
              {orderType === "dine_in" && selectedTableNumber != null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full px-4 text-xs"
                  type="button"
                  onClick={onRequestChangeTable}
                >
                  Đổi bàn
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                <span>Tiến độ tạo đơn</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <Progress value={isSubmitting ? undefined : progressPercent} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Giỏ thao tác</p>
            <p className="text-xs text-muted-foreground">
              {items.length === 0
                ? "Chưa có món trong giỏ"
                : `${totalQuantity} món đang chờ xác nhận`}
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 h-9 rounded-full px-3 text-xs text-muted-foreground"
              >
                <Trash2 className="mr-1 size-3.5" />
                Xóa giỏ
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

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <div className="flex size-16 items-center justify-center rounded-full border border-dashed border-border/80 bg-background/70">
            <ShoppingCart className="size-7 opacity-40" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Giỏ đang trống</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Chọn món từ menu để bắt đầu một đơn mới hoặc tiếp tục bổ sung món.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1">
            <div className="space-y-3 p-4">
              {items.map((item) => {
                const subtotal = calcItemSubtotal(item);

                return (
                  <div
                    key={item.key}
                    className="transition-all hover:-translate-y-0.5 hover:shadow-md rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className="rounded-lg bg-warning/12 px-2.5 py-1 text-sm font-black text-warning tabular-nums">
                            {item.quantity}x
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-foreground">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11 size-9 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                        aria-label={`Xóa ${item.item_name} khỏi giỏ`}
                        onClick={() => onRemoveItem(item.key)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="min-h-11 min-w-11 size-11 rounded-lg"
                          aria-label={`Giảm số lượng ${item.item_name}`}
                          onClick={() => onUpdateQuantity(item.key, -1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-10 text-center text-base font-bold tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="min-h-11 min-w-11 size-11 rounded-lg"
                          aria-label={`Tăng số lượng ${item.item_name}`}
                          onClick={() => onUpdateQuantity(item.key, 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Thành tiền
                        </p>
                        <p className="text-base font-bold text-primary">
                          {formatVND(subtotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="border-t border-border/60 bg-background px-4 py-4">
            <div className="space-y-1.5">
              <label
                htmlFor="pos-order-note"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
                className="resize-none rounded-lg text-sm"
                aria-describedby="pos-order-note-hint"
              />
              <p
                id="pos-order-note-hint"
                className="text-xs leading-5 text-muted-foreground"
              >
                Tối đa 500 ký tự. Áp dụng cho toàn đơn.
              </p>
            </div>

            <div className="rounded-xl border bg-card shadow-sm mt-4 p-4">
              <div className="relative space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tổng tạm tính
                    </p>
                    <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                      {formatVND(total)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm",
                      canSubmit
                        ? "border-success/15 bg-success/10 text-success"
                        : "border-warning/15 bg-warning/10 text-warning",
                    )}
                  >
                    {canSubmit ? "Sẵn sàng gửi bếp" : "Chờ hoàn thiện thông tin đơn"}
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="min-h-14 min-w-14 h-14 w-full rounded-xl text-base font-bold tracking-wide shadow-md transition-transform hover:-translate-y-0.5"
                      size="lg"
                      disabled={!canSubmit || isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner className="mr-2 size-5" />
                          Đang xử lý...
                        </>
                      ) : (
                        "Đặt món"
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xác nhận gửi đơn</AlertDialogTitle>
                      <AlertDialogDescription>
                        {orderType === "takeaway"
                          ? `Đơn mang về gồm ${totalQuantity} món, tạm tính ${formatVND(total)}.`
                          : `Đơn tại bàn ${selectedTableNumber ?? "đã chọn"} gồm ${totalQuantity} món, tạm tính ${formatVND(total)}.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Quay lại</AlertDialogCancel>
                      <AlertDialogAction onClick={onSubmitOrder}>
                        Gửi đơn
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {!canSubmit && items.length > 0 && orderType === "dine_in" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Vui lòng chọn bàn để hoàn tất đơn tại chỗ.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
