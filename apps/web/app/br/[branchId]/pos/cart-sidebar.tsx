"use client";

import { useState } from "react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  IconMinus,
  IconPackage,
  IconPlus,
  IconShoppingCart,
  IconTrash,
  IconToolsKitchen,
  IconX,
} from "@tabler/icons-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const cartDialogOpen = confirmOpen || clearConfirmOpen;
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

  useKeyboardShortcut([
    // Cmd/Ctrl + Enter: open submit confirmation (works even while typing note)
    {
      key: "Enter",
      meta: true,
      fireInInput: true,
      preventDefault: true,
      handler: () => {
        if (!cartDialogOpen && canSubmit && !isSubmitting) setConfirmOpen(true);
      },
    },
    // T: switch to takeaway (ignored while typing)
    {
      key: "t",
      handler: () => {
        if (!cartDialogOpen) onOrderTypeChange("takeaway");
      },
    },
    // D: switch to dine-in
    {
      key: "d",
      handler: () => {
        if (!cartDialogOpen) onOrderTypeChange("dine_in");
      },
    },
  ]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Đơn mới
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
              {contextLabel}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length > 0
                ? `${totalQuantity} món đang chờ gửi bếp`
                : "Chọn món từ menu để bắt đầu"}
            </p>
          </div>
          <Badge variant={canSubmit ? "success" : "outline"}>
            {canSubmit ? "Gửi được" : "Đang tạo"}
          </Badge>
        </div>

        <ToggleGroup
          type="single"
          value={orderType}
          variant="outline"
          size="lg"
          className="mt-4 grid w-full grid-cols-2 gap-2"
          onValueChange={(value) => {
            if (value === "dine_in" || value === "takeaway") {
              onOrderTypeChange(value);
            }
          }}
        >
          <ToggleGroupItem
            value="dine_in"
            className="min-h-12 justify-center gap-2 rounded-lg text-sm font-semibold"
            aria-keyshortcuts="D"
          >
            <IconToolsKitchen className="size-4" />
            Tại bàn
            <Kbd className="ml-1 hidden md:inline-flex">D</Kbd>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="takeaway"
            className="min-h-12 justify-center gap-2 rounded-lg text-sm font-semibold"
            aria-keyshortcuts="T"
          >
            <IconPackage className="size-4" />
            Mang về
            <Kbd className="ml-1 hidden md:inline-flex">T</Kbd>
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Món</p>
            <p className="mt-1 text-lg font-bold tabular-nums">
              {totalQuantity}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Tổng</p>
            <p className="mt-1 text-lg font-bold text-primary tabular-nums">
              {formatVND(total)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Trạng thái</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {canSubmit ? "Sẵn sàng" : "Chờ món"}
            </p>
          </div>
        </div>

        {orderType === "dine_in" && selectedTableNumber != null && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-9 w-full rounded-lg text-xs"
            type="button"
            onClick={onRequestChangeTable}
          >
            Đổi bàn
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconShoppingCart className="size-5" />
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
          <AlertDialog
            open={clearConfirmOpen}
            onOpenChange={setClearConfirmOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 h-9 rounded-full px-3 text-xs text-muted-foreground"
              >
                <IconTrash className="mr-1 size-3.5" />
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
                <AlertDialogAction
                  onClick={() => {
                    onClearCart();
                    setClearConfirmOpen(false);
                  }}
                >
                  Xóa tất cả
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {items.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col justify-between p-4">
            <Empty className="py-12">
              <EmptyMedia variant="icon">
                <IconShoppingCart />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Giỏ đang trống</EmptyTitle>
                <EmptyDescription>
                  Chạm món ở khu thực đơn để đưa vào đơn mới.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bước tiếp theo
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Chọn món, kiểm tra giỏ, rồi gửi bếp.
                  </p>
                </div>
                <Badge variant="outline">0 món</Badge>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 bg-background px-4 py-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tổng tạm tính
                </p>
                <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                  {formatVND(0)}
                </p>
              </div>
              <Badge variant="outline">Chưa có món</Badge>
            </div>
            <Button
              className="min-h-14 w-full rounded-xl text-base font-bold"
              size="lg"
              disabled
            >
              Chọn món từ menu
            </Button>
          </div>
        </>
      ) : (
        <>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 p-4">
              {items.map((item) => {
                const subtotal = calcItemSubtotal(item);

                return (
                  <div
                    key={item.key}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
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
                        <IconX className="size-4" />
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
                          <IconMinus className="size-4" />
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
                          <IconPlus className="size-4" />
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
            <div className="flex flex-col gap-1.5">
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
              <div className="relative flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tổng tạm tính
                    </p>
                    <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                      {formatVND(total)}
                    </p>
                  </div>
                  <Badge variant={canSubmit ? "success" : "warning"}>
                    {canSubmit ? "Sẵn sàng gửi bếp" : "Chờ hoàn thiện thông tin đơn"}
                  </Badge>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="min-h-14 min-w-14 h-14 w-full rounded-xl text-base font-bold tracking-wide shadow-md transition-transform hover:-translate-y-0.5"
                      size="lg"
                      disabled={!canSubmit || isSubmitting}
                      aria-keyshortcuts="Meta+Enter Control+Enter"
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner className="mr-2 size-5" />
                          Đang xử lý...
                        </>
                      ) : (
                        <>
                          Đặt món
                          <KbdGroup className="ml-2 hidden md:inline-flex">
                            <Kbd>⌘</Kbd>
                            <Kbd>Enter</Kbd>
                          </KbdGroup>
                        </>
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
