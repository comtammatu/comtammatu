"use client";

import { memo, useEffect, useRef, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { Item } from "@comtammatu/ui/components/item";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Trash as IconTrash,
  X as IconX,
} from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { Frame } from "@comtammatu/ui/components/frame";
import { AppEmptyState } from "@/components/surface";
import {
  calcItemDiscountAmount,
  calcItemNetSubtotal,
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../types";
import type { CartItem } from "../types";
import { DELIVERY_PLATFORMS } from "../types";
import {
  DeliveryPlatformMark,
  deliveryPlatformChipLabel,
} from "@/components/delivery-platform-mark";
import { useCart } from "../_hooks/use-cart";
import { useActiveTable } from "../_hooks/use-active-table";
import { useSwipeReveal } from "@lib/hooks/use-swipe-reveal";
import { PosLineItemCompact } from "./pos-line-item-compact";
import {
  deriveJustAddedCartKeys,
  getCartLineEnterClass,
} from "../_lib/cart-line-enter";
import { messages } from "@lib/messages";

import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
const DELETE_REVEAL_WIDTH = 80;
const SWIPE_ACTIVATION_PX = 8;
const SWIPE_REVEAL_THRESHOLD_PX = 40;
const CART_LINE_ENTER_MS = 300;

export type SubmitOrderOptions = {
  priority?: boolean;
};

interface CartPaneProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmitOrder: (options?: SubmitOrderOptions) => void;
  onCustomizeItem: (item: CartItem) => void;
  onClosePane?: () => void;
  onReturnToTables?: () => void;
}

function CartPaneComponent({
  canSubmit,
  isSubmitting,
  onSubmitOrder,
  onCustomizeItem,
  onClosePane,
  onReturnToTables: _onReturnToTables,
}: CartPaneProps) {
  const cart = useCart();
  const activeTable = useActiveTable();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [justAddedKeys, setJustAddedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const knownKeysRef = useRef<ReadonlySet<string> | null>(null);
  const enterTimeoutsRef = useRef<Map<string, number>>(new Map());
  const swipe = useSwipeReveal({
    revealWidth: DELETE_REVEAL_WIDTH,
    activationPx: SWIPE_ACTIVATION_PX,
    threshold: SWIPE_REVEAL_THRESHOLD_PX,
  });
  const cartDialogOpen = confirmOpen;

  const selectedTableNumber = activeTable.table?.number;
  const totalQuantity = cart.quantity;
  const contextLabel =
    cart.orderType === "delivery"
      ? messages.pos.desktop.newDeliveryTarget
      : cart.orderType === "takeaway"
        ? messages.pos.desktop.newTakeawayTarget
        : selectedTableNumber != null
          ? messages.pos.desktop.newDineInTarget(selectedTableNumber)
          : "Chưa chọn bàn";

  const deliveryReady =
    cart.deliveryPlatform != null && cart.externalOrderRef.trim().length > 0;
  const hasRemovingItems = removingKeys.size > 0;

  // One-shot enter for newly added cart lines. A merged quantity++ reuses the
  // line's key (no enter — the line's quantity pulse already covers it); only a
  // brand-new key flashes once, then clears.
  useEffect(() => {
    const currentKeys = cart.items.map((item) => item.key);
    const { nextKnownKeys, addedKeys } = deriveJustAddedCartKeys(
      knownKeysRef.current,
      currentKeys,
    );
    knownKeysRef.current = nextKnownKeys;
    if (addedKeys.length === 0) return;

    setJustAddedKeys((prev) => {
      const next = new Set(prev);
      for (const key of addedKeys) next.add(key);
      return next;
    });

    for (const key of addedKeys) {
      const existing = enterTimeoutsRef.current.get(key);
      if (existing !== undefined) window.clearTimeout(existing);
      const timeoutId = window.setTimeout(() => {
        enterTimeoutsRef.current.delete(key);
        setJustAddedKeys((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, CART_LINE_ENTER_MS);
      enterTimeoutsRef.current.set(key, timeoutId);
    }
  }, [cart.items]);

  useEffect(
    () => () => {
      for (const timeoutId of enterTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      enterTimeoutsRef.current.clear();
    },
    [],
  );

  useKeyboardShortcut([
    {
      key: "Enter",
      meta: true,
      fireInInput: true,
      preventDefault: true,
      handler: () => {
        if (
          !cartDialogOpen &&
          canSubmit &&
          !isSubmitting &&
          !hasRemovingItems
        ) {
          onSubmitOrder();
        }
      },
    },
  ]);

  const isMobileDrawer = onClosePane != null;

  function removeItemWithEffect(key: string) {
    setRemovingKeys((current) => new Set(current).add(key));
    window.setTimeout(() => {
      cart.removeItem(key);
      setRemovingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      swipe.setRevealedKey(null);
    }, 180);
  }

  async function handlePrioritySubmit() {
    setConfirmOpen(true);
    try {
      const ok = await confirm({
        title:
          cart.orderType === "delivery"
            ? messages.pos.pendingDraft.priorityDeliveryTitle
            : cart.orderType === "takeaway"
              ? messages.pos.pendingDraft.priorityTakeawayTitle
              : selectedTableNumber != null
                ? messages.pos.pendingDraft.priorityTableTitle(
                    selectedTableNumber,
                  )
                : messages.pos.pendingDraft.priorityGenericTitle,
        description: messages.pos.pendingDraft.priorityDescription(
          totalQuantity,
          formatVND(cart.total),
        ),
        confirmText: messages.pos.pendingDraft.confirmPriority,
        cancelText: messages.pos.pendingDraft.editAgain,
      });
      if (ok) onSubmitOrder({ priority: true });
    } finally {
      setConfirmOpen(false);
    }
  }

  async function handleClearCart() {
    setConfirmOpen(true);
    try {
      const ok = await confirm({
        title: messages.pos.pendingDraft.clearTitle,
        description: messages.pos.pendingDraft.clearDescription(
          cart.items.length,
        ),
        confirmText: ACTIONS_VI.delete,
        cancelText: messages.pos.pendingDraft.keep,
        variant: "destructive",
      });
      if (ok) cart.clear();
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {isMobileDrawer ? (
        cart.items.length > 0 ? (
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
            <Badge variant="outline" className="max-w-full truncate">
              {contextLabel}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              className="text-muted-foreground hover:text-destructive"
              aria-label={messages.pos.pendingDraft.clear}
              onClick={() => void handleClearCart()}
            >
              <IconTrash />
            </Button>
          </div>
        ) : null
      ) : (
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading truncate text-base font-semibold tracking-tight text-foreground">
              {messages.pos.desktop.pendingNewTitle}
            </h2>
            {totalQuantity > 0 ? (
              <Badge
                variant="secondary"
                className="shrink-0 text-xs font-semibold tabular-nums"
              >
                {totalQuantity}
              </Badge>
            ) : null}
          </div>
          {cart.items.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="touch"
              className="min-w-12 shrink-0 px-3 text-sm text-muted-foreground hover:text-destructive"
              onClick={() => void handleClearCart()}
            >
              <IconTrash data-icon="inline-start" />
              {messages.pos.pendingDraft.clear}
            </Button>
          )}
        </div>
      )}

      {cart.orderType === "delivery" ? (
        <div
          className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-3 py-3 sm:px-4"
          data-testid="pos-delivery-identity"
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {messages.pos.delivery.platformLabel}
            </Label>
            {/*
              Joined Toggle strip + 4-up grid overlaps on the narrow cart
              sidebar. Keep a 2×2 button grid for platform identity.
            */}
            <div
              role="radiogroup"
              aria-label={messages.pos.delivery.platformAria}
              className="grid w-full grid-cols-2 gap-2"
            >
              {DELIVERY_PLATFORMS.map((platform) => {
                const selected = cart.deliveryPlatform === platform;
                return (
                  <Button
                    key={platform}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="touch"
                    role="radio"
                    aria-checked={selected}
                    className="min-w-0 justify-start gap-2 px-2.5"
                    disabled={
                      cart.items.length > 0 &&
                      cart.deliveryPlatform !== platform
                    }
                    onClick={() => cart.setDeliveryPlatform(platform)}
                  >
                    <DeliveryPlatformMark platform={platform} size="sm" />
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {deliveryPlatformChipLabel(platform)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="pos-delivery-external-ref"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {messages.pos.delivery.externalRefLabel}
            </Label>
            <Input
              id="pos-delivery-external-ref"
              value={cart.externalOrderRef}
              onChange={(event) =>
                cart.setExternalOrderRef(event.target.value)
              }
              placeholder={messages.pos.delivery.externalRefPlaceholder}
              maxLength={64}
              className="font-mono text-base"
            />
          </div>
        </div>
      ) : null}

      {cart.items.length === 0 ? (
        // Delivery identity fields above already state the next step — do not
        // park a centered empty-state in the remaining drawer height.
        cart.orderType === "delivery" && !deliveryReady ? (
          <div className="min-h-0 flex-1" aria-hidden="true" />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-4">
            <AppEmptyState
              compact
              symbol="roundPlate"
              title={
                cart.orderType === "delivery" ||
                cart.orderType === "takeaway" ||
                selectedTableNumber != null
                  ? messages.pos.pendingDraft.emptyWithContext
                  : messages.pos.pendingDraft.emptyNoContext
              }
            />
          </div>
        )
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3">
              {cart.items.map((item) => {
                const discountAmount = calcItemDiscountAmount(item);
                const netSubtotal = calcItemNetSubtotal(item);
                const discountLabel =
                  discountAmount > 0
                    ? messages.pos.pendingDraft.itemDiscount(
                        formatVND(discountAmount),
                        item.discount_note ?? undefined,
                      )
                    : null;
                const isDeleteRevealed = swipe.isRevealed(item.key);
                const isRemoving = removingKeys.has(item.key);
                const swipeHandlers = swipe.bindings(item.key);
                const displayName = getPosLineItemDisplayName(item);
                const summary = getPosLineItemSummary(item);
                const itemPaddingClass = isDeleteRevealed
                  ? "pr-20 sm:pr-14"
                  : "pr-14";

                return (
                  <div
                    key={item.key}
                    className={cn(
                      "relative overflow-hidden",
                      justAddedKeys.has(item.key) && getCartLineEnterClass(),
                    )}
                  >
                    <Button
                      variant="destructive"
                      className={cn(
                        "absolute inset-y-0 right-0 z-10 h-auto min-h-full w-20 rounded-none sm:hidden",
                        !isDeleteRevealed && "hidden",
                      )}
                      aria-label={messages.pos.pendingDraft.removeItemAria(
                        displayName,
                      )}
                      onClick={() => removeItemWithEffect(item.key)}
                    >
                      {ACTIONS_VI.delete}
                    </Button>
                    <Item
                      variant="outline"
                      className={cn(
                        "relative touch-pan-y rounded-none bg-card p-0 text-left transition-[background-color,opacity,transform] duration-150 ease-out hover:shadow-effect-card-hover",
                        isRemoving &&
                          "bg-destructive/10 opacity-0 motion-safe:scale-95",
                      )}
                    >
                      <div
                        className={cn(
                          "w-full cursor-pointer select-none",
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
                          total={formatVND(netSubtotal)}
                          originalTotal={
                            discountAmount > 0
                              ? formatVND(netSubtotal + discountAmount)
                              : null
                          }
                          options={summary.options}
                          modifiers={summary.modifiers}
                          sides={summary.sides}
                          discount={discountLabel}
                          note={summary.note}
                          isPriority={summary.isPriority}
                          onIncreaseQuantity={() => {
                            cart.updateQuantity(item.key, 1);
                          }}
                          onDecreaseQuantity={() => {
                            if (item.quantity > 1) {
                              cart.updateQuantity(item.key, -1);
                            } else {
                              removeItemWithEffect(item.key);
                            }
                          }}
                        />
                      </div>
                    </Item>
                    <Button
                      variant="ghost"
                      size="icon-touch"
                      className="absolute right-1 top-2 text-muted-foreground hover:text-destructive"
                      aria-label={messages.pos.pendingDraft.removeItemAria(
                        displayName,
                      )}
                      disabled={isRemoving}
                      onClick={() => removeItemWithEffect(item.key)}
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="pos-order-note"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {cart.orderType === "takeaway"
                  ? messages.pos.pendingDraft.takeawayNoteLabel
                  : messages.pos.pendingDraft.noteLabel}
              </Label>
              <Textarea
                id="pos-order-note"
                value={cart.note}
                onChange={(e) => cart.setNote(e.target.value)}
                placeholder={
                  cart.orderType === "takeaway"
                    ? messages.pos.pendingDraft.takeawayNotePlaceholder
                    : messages.pos.pendingDraft.notePlaceholder
                }
                maxLength={500}
                rows={1}
                className="min-h-8 resize-none text-sm"
                aria-describedby="pos-order-note-hint"
              />
              <p
                id="pos-order-note-hint"
                className="hidden text-xs leading-4 text-muted-foreground sm:block"
              >
                {cart.orderType === "takeaway"
                  ? messages.pos.pendingDraft.takeawayNoteHint
                  : messages.pos.pendingDraft.noteHint}
              </p>
            </div>

            <Frame className="flex flex-col gap-2 p-3">
              <div className="relative flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>
                    {messages.pos.pendingDraft.subtotal}
                  </SectionLabel>
                  <p className="ml-auto font-mono text-lg sm:text-xl font-bold text-primary tabular-nums">
                    {formatVND(cart.total)}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    className="min-w-0 w-full text-base font-bold tracking-wide"
                    size="touch-lg"
                    disabled={!canSubmit || isSubmitting || hasRemovingItems}
                    aria-keyshortcuts="Meta+Enter Control+Enter"
                    onClick={() => onSubmitOrder()}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        {STATES_VI.processing}
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 truncate">
                          {messages.pos.pendingDraft.submitKitchen(totalQuantity)}
                        </span>
                        <KbdGroup className="ml-2 hidden shrink-0 [@media(hover:hover)_and_(min-width:1536px)]:inline-flex">
                          <Kbd>{"⌘"}</Kbd>
                          <Kbd>Enter</Kbd>
                        </KbdGroup>
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-0 w-full text-base font-semibold tracking-wide text-muted-foreground"
                    size="touch-lg"
                    disabled={!canSubmit || isSubmitting || hasRemovingItems}
                    onClick={() => void handlePrioritySubmit()}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        {STATES_VI.processing}
                      </>
                    ) : (
                      <>{messages.pos.pendingDraft.priority}</>
                    )}
                  </Button>
                </div>

                {/* Normal submit fires immediately: the button already
                    shows count + total, and pending items stay editable
	                    after send (editPendingOrderItem). Only the rare
	                    queue-jumping priority send keeps its confirm. */}
                {!canSubmit &&
                  cart.items.length > 0 &&
                  cart.orderType === "delivery" &&
                  !deliveryReady && (
                    <p className="text-center text-xs text-muted-foreground">
                      {messages.pos.delivery.submitBlockedHint}
                    </p>
                  )}
                {!canSubmit &&
                  cart.items.length > 0 &&
                  cart.orderType === "dine_in" && (
                    <p className="text-center text-xs text-muted-foreground">
                      {messages.pos.pendingDraft.chooseTableHint}
                    </p>
                  )}
              </div>
            </Frame>
          </div>
        </>
      )}
    </div>
  );
}

export const CartPane = memo(CartPaneComponent);
