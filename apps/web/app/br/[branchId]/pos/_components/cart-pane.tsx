"use client";

import { memo, useState } from "react";
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
  getPosLineItemSummary,
} from "../types";
import type { CartItem, OrderType } from "../types";
import { useCart } from "../_hooks/use-cart";
import { useActiveTable } from "../_hooks/use-active-table";
import { useSwipeReveal } from "../_hooks/use-swipe-reveal";
import { PosLineItemCompact } from "./pos-line-item-compact";

import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
const DELETE_REVEAL_WIDTH = 80;
const SWIPE_ACTIVATION_PX = 8;
const SWIPE_REVEAL_THRESHOLD_PX = 40;

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
  const swipe = useSwipeReveal({
    revealWidth: DELETE_REVEAL_WIDTH,
    activationPx: SWIPE_ACTIVATION_PX,
    threshold: SWIPE_REVEAL_THRESHOLD_PX,
  });
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

  const isMobileDrawer = onClosePane != null;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div
        className={cn(
          "shrink-0 border-b border-border/60",
          shouldShowOrderTypeSelector ? "p-0" : "px-3 py-2.5 sm:px-4 sm:py-4",
        )}
      >
        {isMobileDrawer && shouldShowOrderTypeSelector ? (
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
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading truncate text-base font-semibold tracking-tight text-foreground sm:text-xl">
                {contextLabel}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isMobileDrawer &&
                cart.orderType === "dine_in" &&
                selectedTableNumber != null && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="text-sm text-muted-foreground"
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
              {!isMobileDrawer && cart.items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="shrink-0 text-sm text-muted-foreground"
                  onClick={() => setClearConfirmOpen(true)}
                >
                  <IconTrash data-icon="inline-start" />
                  Xóa đơn nháp
                </Button>
              )}
              {isMobileDrawer && cart.items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Xóa đơn nháp"
                  onClick={() => setClearConfirmOpen(true)}
                >
                  <IconTrash />
                </Button>
              )}
              {isMobileDrawer && (
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
              )}
            </div>
          </div>
        )}

        {shouldShowOrderTypeSelector && (
          <ToggleGroup
            type="single"
            value={cart.orderType}
            variant="segmented"
            size="touch-lg"
            shape="flush"
            className="grid w-full grid-cols-2"
            aria-label="Chọn hình thức phục vụ"
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
              className="min-w-0 justify-center border-r border-border"
              aria-keyshortcuts="D"
              disabled={modeLocked && cart.orderType !== "dine_in"}
            >
              <IconToolsKitchen data-icon="inline-start" />
              Tại bàn
              <Kbd className="hidden md:inline-flex group-data-[state=on]/toggle:bg-primary-foreground/20 group-data-[state=on]/toggle:text-primary-foreground">
                D
              </Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="takeaway"
              className="min-w-0 justify-center"
              aria-keyshortcuts="T"
              disabled={modeLocked && cart.orderType !== "takeaway"}
            >
              <IconPackage data-icon="inline-start" />
              Mang về
              <Kbd className="hidden md:inline-flex group-data-[state=on]/toggle:bg-primary-foreground/20 group-data-[state=on]/toggle:text-primary-foreground">
                T
              </Kbd>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {cart.items.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            {cart.orderType === "takeaway" || selectedTableNumber != null
              ? "Chạm món trên thực đơn để thêm vào đơn."
              : "Chạm bàn bên trái hoặc chọn 'Mang về' để bắt đầu."}
          </p>
        </div>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div
              className="flex flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3"
              data-vaul-no-drag
            >
              {cart.items.map((item) => {
                const subtotal = calcItemSubtotal(item);
                const isDeleteRevealed = swipe.isRevealed(item.key);
                const swipeHandlers = swipe.bindings(item.key);
                const displayName = getPosLineItemDisplayName(item);
                const summary = getPosLineItemSummary(item);
                const itemPaddingClass = isDeleteRevealed
                  ? "pr-20 sm:pr-14"
                  : "pr-3 sm:pr-14";

                return (
                  <div key={item.key} className="relative overflow-hidden">
                    <Button
                      variant="destructive"
                      className={cn(
                        "absolute inset-y-0 right-0 z-10 h-auto min-h-full w-20 rounded-none sm:hidden",
                        !isDeleteRevealed && "hidden",
                      )}
                      aria-label={`Xóa ${displayName} khỏi giỏ đơn mới`}
                      onClick={() => {
                        cart.removeItem(item.key);
                        swipe.setRevealedKey(null);
                      }}
                    >
                      {ACTIONS_VI.delete}
                    </Button>
                    <Item
                      variant="outline"
                      className="relative h-20 touch-pan-y rounded-none bg-card p-0 text-left shadow-sm transition-colors duration-150 ease-out hover:shadow-md"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-full w-full justify-start py-2 pl-3 text-left whitespace-normal hover:bg-card sm:pl-4",
                          itemPaddingClass,
                        )}
                        onClick={(event) => {
                          if (swipe.consumeSuppression(item.key)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }
                          if (isDeleteRevealed) {
                            swipe.clearReveal();
                            return;
                          }
                          onCustomizeItem(item);
                        }}
                        {...swipeHandlers}
                      >
                        <PosLineItemCompact
                          quantity={item.quantity}
                          title={displayName}
                          total={formatVND(subtotal)}
                          options={summary.options}
                          note={summary.note}
                        />
                      </Button>
                    </Item>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-muted-foreground hover:text-destructive sm:inline-flex"
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
                Tối đa 500 ký tự.
              </p>
            </div>

            <Card size="sm" className="mt-2 sm:mt-3">
              <CardContent className="relative flex flex-col gap-2 sm:gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Tổng tạm tính
                  </p>
                  <p className="ml-auto text-xl font-semibold text-primary tabular-nums sm:text-2xl">
                    {formatVND(cart.total)}
                  </p>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="w-full text-base font-semibold tracking-wide shadow-md"
                      size="touch-lg"
                      disabled={!canSubmit || isSubmitting}
                      aria-keyshortcuts="Meta+Enter Control+Enter"
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          {STATES_VI.processing}
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
                          : `Gửi cho bàn ${selectedTableNumber ?? ""}?`}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {totalQuantity} món · {formatVND(cart.total)}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Sửa lại</AlertDialogCancel>
                      <AlertDialogAction onClick={onSubmitOrder}>
                        Gửi đơn
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {!canSubmit &&
                  cart.items.length > 0 &&
                  cart.orderType === "dine_in" && (
                    <p className="text-center text-sm text-muted-foreground">
                      Chọn bàn để gửi đơn.
                    </p>
                  )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa đơn nháp?</AlertDialogTitle>
            <AlertDialogDescription>
              {cart.items.length} món sẽ bị xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                cart.clear();
                setClearConfirmOpen(false);
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const CartPane = memo(CartPaneComponent);
