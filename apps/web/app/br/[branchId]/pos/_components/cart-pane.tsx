"use client";

import { memo, useRef, useState } from "react";
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
import { Item } from "@comtammatu/ui/components/item";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  ChevronLeft as IconChevronLeft,
  LayoutGrid as IconLayoutGrid,
  Package as IconPackage,
  Trash as IconTrash,
  Utensils as IconToolsKitchen,
  X as IconX,
} from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import {
  calcItemSubtotal,
  getPosLineItemDisplayName,
  getPosLineItemOptionLines,
} from "../types";
import type { CartItem, OrderType } from "../types";
import { useCart } from "../_hooks/use-cart";
import { useActiveTable } from "../_hooks/use-active-table";

const DELETE_REVEAL_WIDTH = 80;
const SWIPE_ACTIVATION_PX = 8;
const SWIPE_REVEAL_THRESHOLD_PX = 40;

interface SwipeState {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  offset: number;
  dragging: boolean;
}

interface CartPaneProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmitOrder: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onCustomizeItem: (item: CartItem) => void;
  onClosePane?: () => void;
  onReturnToTables?: () => void;
}

function CartPaneComponent({
  canSubmit,
  isSubmitting,
  onSubmitOrder,
  onOrderTypeChange,
  onCustomizeItem,
  onClosePane,
  onReturnToTables,
}: CartPaneProps) {
  const cart = useCart();
  const activeTable = useActiveTable();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [revealedItemKey, setRevealedItemKey] = useState<string | null>(null);
  const swipeStateRef = useRef<SwipeState | null>(null);
  const suppressClickKeyRef = useRef<string | null>(null);
  const cartDialogOpen = confirmOpen || clearConfirmOpen;

  const selectedTableNumber = activeTable.table?.number;
  const totalQuantity = cart.quantity;
  const modeLocked = cart.items.length > 0 || selectedTableNumber != null;
  const contextLabel =
    cart.orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chưa chọn bàn";

  const shouldShowOrderTypeSelector =
    cart.items.length === 0 && selectedTableNumber == null;

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
        {onClosePane ? (
          <div className="mb-2 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Đóng giỏ đơn"
              onClick={onClosePane}
            >
              <IconX />
            </Button>
          </div>
        ) : null}

        {!shouldShowOrderTypeSelector && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-xl">
                {contextLabel}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {cart.orderType === "dine_in" && selectedTableNumber != null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 min-h-10 min-w-10 px-3 text-sm text-muted-foreground sm:min-h-11 sm:min-w-11"
                  onClick={() => {
                    if (onReturnToTables) {
                      onReturnToTables();
                    } else {
                      activeTable.setTable(null);
                    }
                  }}
                >
                  <IconLayoutGrid data-icon="inline-start" />
                  Chọn lại bàn
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
                      className="h-10 min-h-10 min-w-10 shrink-0 px-3 text-sm text-muted-foreground sm:min-h-11 sm:min-w-11"
                    >
                      <IconTrash data-icon="inline-start" />
                      Xóa đơn nháp
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xóa đơn nháp?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tất cả {cart.items.length} món sẽ bị xóa khỏi đơn nháp.
                        Hành động này không thể hoàn tác.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Giữ đơn nháp</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                          cart.clear();
                          setClearConfirmOpen(false);
                        }}
                      >
                        Xóa đơn nháp
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}

        {shouldShowOrderTypeSelector && (
          <ToggleGroup
            type="single"
            value={cart.orderType}
            variant="outline"
            size="lg"
            spacing={2}
            className="grid w-full grid-cols-2 gap-2"
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
              className="min-h-12 justify-center gap-2 text-base font-semibold"
              aria-keyshortcuts="D"
              disabled={modeLocked && cart.orderType !== "dine_in"}
            >
              <IconToolsKitchen className="size-4" />
              Tại bàn
              <Kbd className="ml-1 hidden md:inline-flex">D</Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="takeaway"
              className="min-h-12 justify-center gap-2 text-base font-semibold"
              aria-keyshortcuts="T"
              disabled={modeLocked && cart.orderType !== "takeaway"}
            >
              <IconPackage className="size-4" />
              Mang về
              <Kbd className="ml-1 hidden md:inline-flex">T</Kbd>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {cart.items.length === 0 ? (
        <>
          <div className="min-h-0 flex-1" aria-hidden="true" />

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
              className="min-h-14 w-full text-base font-bold"
              size="lg"
              disabled
            >
              Đặt món (0)
            </Button>
          </div>
        </>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div
              className="flex flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3"
              data-vaul-no-drag
            >
              {cart.items.map((item) => {
                const subtotal = calcItemSubtotal(item);
                const isDeleteRevealed = revealedItemKey === item.key;
                const displayName = getPosLineItemDisplayName(item);
                const optionLines = getPosLineItemOptionLines(item);

                return (
                  <div key={item.key} className="relative overflow-hidden">
                    <Button
                      variant="destructive"
                      className="absolute inset-y-0 right-0 h-auto min-h-full w-20 sm:hidden"
                      aria-label={`Xóa ${displayName} khỏi giỏ đơn mới`}
                      onClick={() => {
                        cart.removeItem(item.key);
                        setRevealedItemKey(null);
                      }}
                    >
                      Xóa
                    </Button>
                    {!isDeleteRevealed && (
                      <span
                        className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 text-muted-foreground/35 sm:hidden"
                        aria-hidden="true"
                      >
                        <IconChevronLeft className="size-4" />
                      </span>
                    )}
                    <Item
                      asChild
                      variant="outline"
                      className={cn(
                        "relative touch-pan-y p-3 pr-12 text-left shadow-sm transition-transform duration-150 ease-out hover:shadow-md sm:p-4 sm:pr-14",
                        isDeleteRevealed && "-translate-x-20 sm:translate-x-0",
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start p-0 text-left whitespace-normal hover:bg-transparent"
                        onClick={(event) => {
                          if (suppressClickKeyRef.current === item.key) {
                            suppressClickKeyRef.current = null;
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }
                          if (isDeleteRevealed) {
                            setRevealedItemKey(null);
                            return;
                          }
                          onCustomizeItem(item);
                        }}
                        onPointerDown={(event) => {
                          if (event.pointerType !== "touch") return;
                          if (
                            revealedItemKey !== null &&
                            revealedItemKey !== item.key
                          ) {
                            setRevealedItemKey(null);
                          }
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          swipeStateRef.current = {
                            key: item.key,
                            pointerId: event.pointerId,
                            startX: event.clientX,
                            startY: event.clientY,
                            startOffset: isDeleteRevealed
                              ? -DELETE_REVEAL_WIDTH
                              : 0,
                            offset: isDeleteRevealed ? -DELETE_REVEAL_WIDTH : 0,
                            dragging: false,
                          };
                        }}
                        onPointerMove={(event) => {
                          const state = swipeStateRef.current;
                          if (
                            state == null ||
                            state.key !== item.key ||
                            state.pointerId !== event.pointerId
                          ) {
                            return;
                          }
                          const deltaX = event.clientX - state.startX;
                          const deltaY = event.clientY - state.startY;
                          const horizontal =
                            Math.abs(deltaX) > Math.abs(deltaY) &&
                            Math.abs(deltaX) > SWIPE_ACTIVATION_PX;
                          if (!horizontal && !state.dragging) return;

                          event.preventDefault();
                          event.stopPropagation();

                          const nextOffset = Math.min(
                            0,
                            Math.max(
                              -DELETE_REVEAL_WIDTH,
                              state.startOffset + deltaX,
                            ),
                          );
                          swipeStateRef.current = {
                            ...state,
                            offset: nextOffset,
                            dragging: true,
                          };
                        }}
                        onPointerUp={(event) => {
                          const state = swipeStateRef.current;
                          if (
                            state == null ||
                            state.key !== item.key ||
                            state.pointerId !== event.pointerId
                          ) {
                            return;
                          }

                          if (
                            event.currentTarget.hasPointerCapture(
                              event.pointerId,
                            )
                          ) {
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                          }

                          if (state.dragging) {
                            const shouldReveal =
                              state.offset <= -SWIPE_REVEAL_THRESHOLD_PX;
                            setRevealedItemKey(shouldReveal ? item.key : null);
                            suppressClickKeyRef.current = item.key;
                            event.preventDefault();
                            event.stopPropagation();
                          }

                          swipeStateRef.current = null;
                        }}
                        onPointerCancel={(event) => {
                          const state = swipeStateRef.current;
                          if (
                            state?.key === item.key &&
                            state.pointerId === event.pointerId
                          ) {
                            swipeStateRef.current = null;
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                                x{item.quantity}
                              </span>
                              <p className="min-w-0 truncate text-base font-semibold leading-snug text-foreground">
                                {displayName}
                              </p>
                            </div>
                            {optionLines.map((line) => (
                              <p
                                key={line}
                                className="mt-1 text-sm leading-5 text-muted-foreground"
                              >
                                {line}
                              </p>
                            ))}
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <p className="whitespace-nowrap text-right text-base font-bold text-primary tabular-nums">
                              {formatVND(subtotal)}
                            </p>
                          </div>
                        </div>
                      </Button>
                    </Item>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 hidden min-h-11 min-w-11 size-9 -translate-y-1/2 text-muted-foreground hover:text-destructive sm:inline-flex"
                      aria-label={`Xóa ${displayName} khỏi giỏ đơn mới`}
                      onClick={() => cart.removeItem(item.key)}
                    >
                      <IconX />
                    </Button>
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
                className="resize-none text-base"
                aria-describedby="pos-order-note-hint"
              />
              <p
                id="pos-order-note-hint"
                className="hidden text-xs leading-5 text-muted-foreground sm:block"
              >
                Tối đa 500 ký tự. Áp dụng cho toàn đơn.
              </p>
            </div>

            <Card size="sm" className="mt-2 sm:mt-3">
              <CardContent className="relative flex flex-col gap-2 p-2.5 sm:gap-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Tổng tạm tính
                  </p>
                  <p className="ml-auto text-xl font-bold text-primary tabular-nums sm:text-2xl">
                    {formatVND(cart.total)}
                  </p>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="h-12 min-h-12 min-w-12 w-full text-base font-bold tracking-wide shadow-md sm:h-14 sm:min-h-14"
                      size="lg"
                      disabled={!canSubmit || isSubmitting}
                      aria-keyshortcuts="Meta+Enter Control+Enter"
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          Đang xử lý...
                        </>
                      ) : (
                        <>
                          Đặt món ({totalQuantity})
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
                      <AlertDialogTitle>
                        {cart.orderType === "takeaway"
                          ? "Gửi đơn mang về?"
                          : `Gửi đơn mới cho bàn ${selectedTableNumber ?? "đã chọn"}?`}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {cart.orderType === "takeaway"
                          ? `Tạo đơn mang về mới • ${totalQuantity} món • ${formatVND(cart.total)}`
                          : `Tạo đơn mới tại bàn ${selectedTableNumber ?? "đã chọn"} • ${totalQuantity} món • ${formatVND(cart.total)}`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Sửa đơn nháp</AlertDialogCancel>
                      <AlertDialogAction onClick={onSubmitOrder}>
                        Gửi đơn mới
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
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export const CartPane = memo(CartPaneComponent);
