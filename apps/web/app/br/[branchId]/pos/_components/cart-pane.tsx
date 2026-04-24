"use client";

import { memo, useState } from "react";
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
  IconLayoutGrid,
  IconPackage,
  IconShoppingCart,
  IconTrash,
  IconToolsKitchen,
  IconX,
} from "@tabler/icons-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { calcItemSubtotal, getPosLineItemDisplayName } from "../types";
import type { CartItem, OrderType } from "../types";
import { useCart } from "../_hooks/use-cart";
import { useActiveTable } from "../_hooks/use-active-table";

interface CartPaneProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmitOrder: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onCustomizeItem: (item: CartItem) => void;
  onReturnToTables?: () => void;
}

function CartPaneComponent({
  canSubmit,
  isSubmitting,
  onSubmitOrder,
  onOrderTypeChange,
  onCustomizeItem,
  onReturnToTables,
}: CartPaneProps) {
  const cart = useCart();
  const activeTable = useActiveTable();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [revealedItemKey, setRevealedItemKey] = useState<string | null>(null);
  const [draggedItemKey, setDraggedItemKey] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);
  const cartDialogOpen = confirmOpen || clearConfirmOpen;

  const selectedTableNumber = activeTable.table?.number;
  const totalQuantity = cart.quantity;
  const modeLocked = cart.items.length > 0 || selectedTableNumber != null;
  const orderReadyLabel = canSubmit ? "Sẵn sàng đặt món" : "Đang tạo";
  const contextLabel =
    cart.orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chưa chọn bàn";

  const shouldShowOrderTypeSelector =
    cart.items.length === 0 &&
    cart.orderType === "dine_in" &&
    selectedTableNumber == null;

  useKeyboardShortcut([
    {
      key: "Enter",
      meta: true,
      fireInInput: true,
      preventDefault: true,
      handler: () => {
        if (!cartDialogOpen && canSubmit && !isSubmitting) setConfirmOpen(true);
      },
    },
    {
      key: "t",
      handler: () => {
        if (!cartDialogOpen && !modeLocked) onOrderTypeChange("takeaway");
      },
    },
    {
      key: "d",
      handler: () => {
        if (!cartDialogOpen && !modeLocked) onOrderTypeChange("dine_in");
      },
    },
  ]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/60 px-3 py-2.5 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-xl">
              {contextLabel} - Giỏ hàng
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cart.items.length > 0
                ? `${totalQuantity} món đang chờ xác nhận`
                : "Chưa có món trong giỏ"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {cart.orderType === "dine_in" && selectedTableNumber != null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 min-w-10 h-10 rounded-full px-3 text-sm text-muted-foreground sm:min-h-11 sm:min-w-11"
                onClick={() => {
                  if (onReturnToTables) {
                    onReturnToTables();
                  } else {
                    activeTable.setTable(null);
                  }
                }}
              >
                <IconLayoutGrid className="mr-1 size-3.5" />
                Đổi/Hủy bàn
              </Button>
            )}
            {cart.items.length > 0 && (
              <AlertDialog
                open={clearConfirmOpen}
                onOpenChange={setClearConfirmOpen}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-10 min-w-10 h-10 shrink-0 rounded-full px-3 text-sm text-muted-foreground sm:min-h-11 sm:min-w-11"
                  >
                    <IconTrash className="mr-1 size-3.5" />
                    Xóa giỏ
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {"X\u00f3a gi\u1ecf h\u00e0ng?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Tất cả {cart.items.length} món sẽ bị xóa khỏi giỏ hàng.
                      Hành động này không thể hoàn tác.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hủy</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        cart.clear();
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
        </div>

        {shouldShowOrderTypeSelector && (
          <ToggleGroup
            type="single"
            value={cart.orderType}
            variant="outline"
            size="lg"
            className="mt-4 grid w-full grid-cols-2 gap-2"
            onValueChange={(value) => {
              if (
                !modeLocked &&
                (value === "dine_in" || value === "takeaway")
              ) {
                onOrderTypeChange(value);
              }
            }}
          >
            <ToggleGroupItem
              value="dine_in"
              className="min-h-12 justify-center gap-2 rounded-lg text-base font-semibold"
              aria-keyshortcuts="D"
              disabled={modeLocked && cart.orderType !== "dine_in"}
            >
              <IconToolsKitchen className="size-4" />
              Tại bàn
              <Kbd className="ml-1 hidden md:inline-flex">D</Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="takeaway"
              className="min-h-12 justify-center gap-2 rounded-lg text-base font-semibold"
              aria-keyshortcuts="T"
              disabled={modeLocked && cart.orderType !== "takeaway"}
            >
              <IconPackage className="size-4" />
              Mang về
              <Kbd className="ml-1 hidden md:inline-flex">T</Kbd>
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        <div className="mt-3 hidden grid-cols-3 gap-2 sm:grid">
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Món</p>
            <p className="mt-1 text-lg font-bold tabular-nums">
              {totalQuantity}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Tổng</p>
            <p className="mt-1 text-lg font-bold text-primary tabular-nums">
              {formatVND(cart.total)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Trạng thái</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {orderReadyLabel}
            </p>
          </div>
        </div>
      </div>

      {cart.items.length === 0 ? (
        <>
          <div className="flex flex-1 items-center justify-center p-4">
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
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tổng tạm tính
              </p>
              <p className="text-2xl font-bold text-primary tabular-nums">
                {formatVND(0)}
              </p>
            </div>
            <Button
              className="min-h-14 w-full rounded-xl text-base font-bold"
              size="lg"
              disabled
            >
              Đặt món
            </Button>
          </div>
        </>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3">
              {cart.items.map((item) => {
                const subtotal = calcItemSubtotal(item);
                const isDeleteRevealed = revealedItemKey === item.key;
                const displayName = getPosLineItemDisplayName(item);

                return (
                  <div
                    key={item.key}
                    className="relative overflow-hidden rounded-xl"
                  >
                    <Button
                      variant="destructive"
                      className="absolute inset-y-0 right-0 h-auto min-h-full w-20 rounded-none sm:hidden"
                      aria-label={`Xóa ${displayName} khỏi giỏ`}
                      onClick={() => {
                        cart.removeItem(item.key);
                        setRevealedItemKey(null);
                      }}
                    >
                      Xóa
                    </Button>
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "relative rounded-xl border border-border bg-card p-3 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md sm:p-4",
                        isDeleteRevealed && "-translate-x-20 sm:translate-x-0",
                      )}
                      onClick={() => {
                        if (draggedItemKey === item.key) {
                          setDraggedItemKey(null);
                          return;
                        }
                        if (isDeleteRevealed) return;
                        onCustomizeItem(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onCustomizeItem(item);
                        }
                      }}
                      onTouchStart={(event) => {
                        const touch = event.touches[0];
                        if (!touch) return;
                        setTouchStart({
                          key: item.key,
                          x: touch.clientX,
                          y: touch.clientY,
                        });
                      }}
                      onTouchMove={(event) => {
                        if (touchStart?.key !== item.key) return;
                        const touch = event.touches[0];
                        if (!touch) return;
                        const deltaX = touch.clientX - touchStart.x;
                        const deltaY = touch.clientY - touchStart.y;
                        if (Math.abs(deltaX) < Math.abs(deltaY)) return;
                        if (Math.abs(deltaX) > 12) {
                          setDraggedItemKey(item.key);
                        }
                        if (deltaX < -32) {
                          setRevealedItemKey(item.key);
                        } else if (deltaX > 32) {
                          setRevealedItemKey(null);
                        }
                      }}
                      onTouchEnd={() => {
                        setTouchStart(null);
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                              x{item.quantity}
                            </span>
                            <p className="truncate text-base font-semibold leading-snug text-foreground">
                              {displayName}
                            </p>
                          </div>
                          {item.modifiers.length > 0 && (
                            <p className="mt-1 text-sm leading-5 text-muted-foreground">
                              + {item.modifiers.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          {item.sides.length > 0 && (
                            <p className="mt-1 text-sm leading-5 text-muted-foreground">
                              Kèm:{" "}
                              {item.sides
                                .map((s) =>
                                  s.quantity > 1
                                    ? `${s.name} x${String(s.quantity)}`
                                    : s.name,
                                )
                                .join(", ")}
                            </p>
                          )}
                          {item.note && (
                            <p className="mt-1 text-sm italic leading-5 text-muted-foreground">
                              Ghi chú: {item.note}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-center">
                          <p className="text-base font-bold text-primary tabular-nums">
                            {formatVND(subtotal)}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="hidden min-h-11 min-w-11 size-9 shrink-0 rounded-full text-muted-foreground hover:text-destructive sm:inline-flex"
                            aria-label={`Xóa ${displayName} khỏi giỏ`}
                            onClick={(event) => {
                              event.stopPropagation();
                              cart.removeItem(item.key);
                            }}
                          >
                            <IconX className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border/60 bg-background px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="pos-order-note"
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Ghi chú đơn
              </label>
              <Textarea
                id="pos-order-note"
                value={cart.note}
                onChange={(e) => cart.setNote(e.target.value)}
                placeholder="Ví dụ: ít đường, không hành..."
                maxLength={500}
                rows={1}
                className="resize-none rounded-lg text-base"
                aria-describedby="pos-order-note-hint"
              />
              <p
                id="pos-order-note-hint"
                className="hidden text-xs leading-5 text-muted-foreground sm:block"
              >
                Tối đa 500 ký tự. Áp dụng cho toàn đơn.
              </p>
            </div>

            <div className="mt-2 rounded-xl border bg-card p-2.5 shadow-sm sm:mt-3 sm:p-4">
              <div className="relative flex flex-col gap-2 sm:gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Tổng tạm tính
                  </p>
                  <p className="ml-auto text-xl font-bold text-primary tabular-nums sm:text-2xl">
                    {formatVND(cart.total)}
                  </p>
                  <Badge
                    variant={canSubmit ? "success" : "warning"}
                    className="hidden sm:inline-flex"
                  >
                    {canSubmit
                      ? orderReadyLabel
                      : "Chờ hoàn thiện thông tin đơn"}
                  </Badge>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="min-h-12 min-w-12 h-12 w-full rounded-xl text-base font-bold tracking-wide shadow-md transition-transform hover:-translate-y-0.5 sm:min-h-14 sm:h-14"
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
                            <Kbd>{"⌘"}</Kbd>
                            <Kbd>Enter</Kbd>
                          </KbdGroup>
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xác nhận đặt món</AlertDialogTitle>
                      <AlertDialogDescription>
                        {cart.orderType === "takeaway"
                          ? `Mang về • ${totalQuantity} món • ${formatVND(cart.total)}`
                          : `Bàn ${selectedTableNumber ?? "đã chọn"} • ${totalQuantity} món • ${formatVND(cart.total)}`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Quay lại</AlertDialogCancel>
                      <AlertDialogAction onClick={onSubmitOrder}>
                        Đặt món
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {!canSubmit &&
                  cart.items.length > 0 &&
                  cart.orderType === "dine_in" && (
                    <p className="text-center text-sm text-muted-foreground">
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

export const CartPane = memo(CartPaneComponent);
