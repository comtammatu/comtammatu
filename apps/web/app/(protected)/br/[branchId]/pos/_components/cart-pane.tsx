"use client";

import { memo, useEffect, useRef, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Item } from "@comtammatu/ui/components/item";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Label } from "@comtammatu/ui/components/label";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
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
import { AppEmptyState, AppSection } from "@/components/surface";
import {
  calcItemDiscountAmount,
  calcItemNetSubtotal,
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../types";
import type { CartItem, OrderType } from "../types";
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
  const modeLocked = cart.items.length > 0 || selectedTableNumber != null;
  const contextLabel =
    cart.orderType === "takeaway"
      ? messages.pos.desktop.newTakeawayTarget
      : selectedTableNumber != null
        ? messages.pos.desktop.newDineInTarget(selectedTableNumber)
        : "Chưa chọn bàn";

  const shouldShowOrderTypeSelector =
    cart.items.length === 0 && selectedTableNumber == null;
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
          cart.orderType === "takeaway"
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
      <div
        className={cn(
          "shrink-0 border-b border-border/60",
          shouldShowOrderTypeSelector ? "p-0" : "px-3 py-3 sm:px-4 sm:py-4",
        )}
      >
        {isMobileDrawer && shouldShowOrderTypeSelector ? (
          <div className="mb-2 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="touch"
              className="w-12 px-0 text-muted-foreground"
              aria-label={messages.pos.pendingDraft.closeAria}
              onClick={onClosePane}
            >
              <IconX />
            </Button>
          </div>
        ) : null}

        {!shouldShowOrderTypeSelector && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                {messages.pos.desktop.pendingNewTitle}
              </h2>
              <Badge variant="outline" className="mt-1 max-w-full truncate">
                {contextLabel}
              </Badge>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isMobileDrawer &&
                cart.orderType === "dine_in" &&
                selectedTableNumber != null && (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="min-w-12 px-3 text-sm text-muted-foreground"
                    onClick={() => {
                      if (onReturnToTables) {
                        onReturnToTables();
                      } else {
                        activeTable.setTable(null);
                      }
                    }}
                  >
                    <IconLayoutGrid data-icon="inline-start" />
                    {messages.pos.desktop.changeTarget}
                  </Button>
                )}
              {!isMobileDrawer && cart.items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="min-w-12 shrink-0 px-3 text-sm text-muted-foreground"
                  onClick={() => void handleClearCart()}
                >
                  <IconTrash data-icon="inline-start" />
                  {messages.pos.pendingDraft.clear}
                </Button>
              )}
              {isMobileDrawer && cart.items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="w-12 px-0 text-muted-foreground hover:text-destructive"
                  aria-label={messages.pos.pendingDraft.clear}
                  onClick={() => void handleClearCart()}
                >
                  <IconTrash />
                </Button>
              )}
              {isMobileDrawer && (
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="w-12 px-0 text-muted-foreground"
                  aria-label={messages.pos.pendingDraft.closeAria}
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
            variant="outline"
            size="touch"
            spacing={0}
            className="grid w-full grid-cols-2"
            aria-label={messages.pos.desktop.serviceModeAria}
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
              className="min-w-0 justify-center gap-2 text-base font-semibold"
              aria-keyshortcuts="D"
              disabled={modeLocked && cart.orderType !== "dine_in"}
            >
              <IconToolsKitchen data-icon="inline-start" />
              {messages.pos.desktop.dineIn}
              <Kbd className="hidden [@media(hover:hover)]:inline-flex">D</Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="takeaway"
              className="min-w-0 justify-center gap-2 text-base font-semibold"
              aria-keyshortcuts="T"
              disabled={modeLocked && cart.orderType !== "takeaway"}
            >
              <IconPackage data-icon="inline-start" />
              {messages.pos.desktop.takeaway}
              <Kbd className="hidden [@media(hover:hover)]:inline-flex">T</Kbd>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {cart.items.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <AppEmptyState
            compact
            symbol="roundPlate"
            title={
              cart.orderType === "takeaway" || selectedTableNumber != null
                ? messages.pos.pendingDraft.emptyWithContext
                : messages.pos.pendingDraft.emptyNoContext
            }
          />
        </div>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="touch"
                        className={cn(
                          "w-full justify-start py-2 pl-2 text-left whitespace-normal hover:bg-card sm:pl-3",
                          itemPaddingClass,
                        )}
                        disabled={isRemoving}
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
                          options={summary.options}
                          modifiers={summary.modifiers}
                          sides={summary.sides}
                          discount={discountLabel}
                          note={summary.note}
                          isPriority={summary.isPriority}
                        />
                      </Button>
                    </Item>
                    <Button
                      variant="ghost"
                      size="touch"
                      className="absolute right-2 top-1/2 inline-flex min-w-12 -translate-y-1/2 px-0 text-muted-foreground hover:text-destructive"
                      aria-label={messages.pos.pendingDraft.removeItemAria(
                        displayName,
                      )}
                      disabled={isRemoving}
                      onClick={() => removeItemWithEffect(item.key)}
                    >
                      <IconX />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex shrink-0 flex-col gap-3 border-t border-border/60 bg-background px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-1.5">
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
                className="resize-none text-base"
                aria-describedby="pos-order-note-hint"
              />
              <p
                id="pos-order-note-hint"
                className="hidden text-xs leading-5 text-muted-foreground sm:block"
              >
                {cart.orderType === "takeaway"
                  ? messages.pos.pendingDraft.takeawayNoteHint
                  : messages.pos.pendingDraft.noteHint}
              </p>
            </div>

            <AppSection size="sm">
              <div className="relative flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>
                    {messages.pos.pendingDraft.subtotal}
                  </SectionLabel>
                  <p className="ml-auto font-mono text-xl font-bold text-primary tabular-nums">
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
                  cart.orderType === "dine_in" && (
                    <p className="text-center text-sm text-muted-foreground">
                      {messages.pos.pendingDraft.chooseTableHint}
                    </p>
                  )}
              </div>
            </AppSection>
          </div>
        </>
      )}
    </div>
  );
}

export const CartPane = memo(CartPaneComponent);
