"use client";

import { useMemo, useState } from "react";
import {
  Minus as IconMinus,
  Plus as IconPlus,
  ShoppingCart as IconCart,
  Trash2 as IconTrash,
  X as IconX,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { AppEmptyState } from "@/components/surface";
import type {
  SelfOrderCartItem,
  SelfOrderMenuCategory,
  SelfOrderMenuItem,
} from "@lib/self-order/contracts";
import { SelfOrderItemSheet } from "./item-sheet";
import { splitMenuItemDisplayName } from "./menu-display";

function lineTotal(item: SelfOrderCartItem) {
  const modifierTotal = item.modifiers.reduce(
    (sum, modifier) => sum + modifier.price,
    0,
  );
  const sideTotal = item.sides.reduce(
    (sum, side) => sum + side.price * side.quantity,
    0,
  );
  return (item.unit_price + modifierTotal + sideTotal) * item.quantity;
}

function cartOptionSummary(item: SelfOrderCartItem) {
  return [
    item.variant_name,
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      side.quantity > 1 ? `${side.quantity}x ${side.name}` : side.name,
    ),
    item.note ? `${SELF_ORDER_VI.itemNoteLabel}: ${item.note}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function findMenuItem(
  categories: SelfOrderMenuCategory[],
  menuItemId: number,
): SelfOrderMenuItem | null {
  for (const category of categories) {
    const match = category.menu_items.find((item) => item.id === menuItemId);
    if (match) return match;
  }
  return null;
}

export interface CartSheetProps {
  categories: SelfOrderMenuCategory[];
  items: SelfOrderCartItem[];
  total: number;
  quantity: number;
  isSubmitting: boolean;
  isEditingLocked: boolean;
  canSubmit: boolean;
  ctaLabel: string;
  ctaDisabled: boolean;
  ctaDisabledHint: string | null;
  submitError: string | null;
  customerNote: string;
  onCustomerNoteChange: (value: string) => void;
  onQuantityChange: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onReplace: (item: SelfOrderCartItem) => void;
  onSubmit: () => void;
}

function CartLine({
  item,
  disabled,
  canEdit,
  onEdit,
  onQuantityChange,
  onRemove,
}: {
  item: SelfOrderCartItem;
  disabled: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onQuantityChange: CartSheetProps["onQuantityChange"];
  onRemove: CartSheetProps["onRemove"];
}) {
  const { title, tag } = splitMenuItemDisplayName(item.item_name);
  const optionSummary = cartOptionSummary(item);

  return (
    <Item className="items-start px-0 py-3">
      <ItemContent className="min-w-0 gap-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <ItemTitle className="text-base font-semibold">
              {title}
            </ItemTitle>
            {tag ? (
              <Badge variant="secondary" className="px-1.5 text-2xs">
                {tag}
              </Badge>
            ) : null}
          </div>
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
            {formatVND(lineTotal(item))}
          </span>
        </div>
        {optionSummary ? (
          <ItemDescription className="line-clamp-2">
            {optionSummary}
          </ItemDescription>
        ) : null}
        <ItemActions className="mt-2 w-full justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !canEdit}
            onClick={onEdit}
          >
            {SELF_ORDER_VI.editCartItem}
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={disabled || item.quantity <= 1}
              onClick={() => onQuantityChange(item.key, -1)}
              aria-label={`${SELF_ORDER_VI.decreaseQuantityAria}: ${item.item_name}`}
            >
              <IconMinus />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {item.quantity}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onQuantityChange(item.key, 1)}
              aria-label={`${SELF_ORDER_VI.increaseQuantityAria}: ${item.item_name}`}
            >
              <IconPlus />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onRemove(item.key)}
              aria-label={`${SELF_ORDER_VI.removeItem}: ${item.item_name}`}
              className="text-muted-foreground"
            >
              <IconTrash />
            </Button>
          </div>
        </ItemActions>
      </ItemContent>
    </Item>
  );
}

export function CartSheet(props: CartSheetProps) {
  const {
    categories,
    items,
    total,
    quantity,
    customerNote,
    ctaLabel,
    ctaDisabled,
    ctaDisabledHint,
  } = props;
  const [open, setOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const empty = items.length === 0;
  const editingDisabled = props.isSubmitting || props.isEditingLocked;

  const editingCartItem = useMemo(
    () => items.find((item) => item.key === editingKey) ?? null,
    [editingKey, items],
  );
  const editingMenuItem = useMemo(
    () =>
      editingCartItem
        ? findMenuItem(categories, editingCartItem.menu_item_id)
        : null,
    [categories, editingCartItem],
  );

  const submitDisabled =
    !props.canSubmit || props.isSubmitting || ctaDisabled;

  return (
    <>
      {!empty ? (
        <div className="workflow-safe-pb fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
          {props.submitError ? (
            <Alert variant="destructive" className="mb-2">
              <AlertDescription>{props.submitError}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="button"
            size="touch-lg"
            className="w-full justify-between"
            disabled={props.isSubmitting}
            onClick={() => setOpen(true)}
          >
            <span className="flex items-center gap-2">
              <IconCart />
              {SELF_ORDER_VI.viewCart}
              <Badge variant="secondary">{quantity}</Badge>
            </span>
            <span className="font-mono tabular-nums">{formatVND(total)}</span>
          </Button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto flex max-h-dvh-95 w-full max-w-2xl flex-col p-0"
        >
          <SheetHeader className="pr-3 sm:pr-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <SheetTitle className="flex min-w-0 items-center gap-2 text-left">
                  {SELF_ORDER_VI.cartTitle}
                  {quantity > 0 ? (
                    <Badge variant="secondary">{quantity}</Badge>
                  ) : null}
                </SheetTitle>
                <SheetDescription className="text-left">
                  {empty
                    ? SELF_ORDER_VI.cartEmpty
                    : SELF_ORDER_VI.cartReviewDescription}
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  className="-mt-1 -mr-1 shrink-0 self-start text-muted-foreground"
                  aria-label={SELF_ORDER_VI.closeCartAria}
                >
                  <IconX />
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 px-4 py-3">
              {empty ? (
                <AppEmptyState
                  title={SELF_ORDER_VI.cartEmpty}
                  symbol="riceBowl"
                  compact
                />
              ) : (
                <>
                  <ItemGroup data-size="xs">
                    {items.map((item, index) => (
                      <div key={item.key}>
                        {index > 0 ? <ItemSeparator /> : null}
                        <CartLine
                          item={item}
                          disabled={editingDisabled}
                          canEdit={
                            findMenuItem(categories, item.menu_item_id) != null
                          }
                          onEdit={() => setEditingKey(item.key)}
                          onQuantityChange={props.onQuantityChange}
                          onRemove={props.onRemove}
                        />
                      </div>
                    ))}
                  </ItemGroup>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="self-order-note">
                      {SELF_ORDER_VI.noteLabel}
                    </Label>
                    <Textarea
                      id="self-order-note"
                      name="customerNote"
                      autoComplete="off"
                      value={customerNote}
                      disabled={editingDisabled}
                      maxLength={500}
                      rows={2}
                      placeholder={SELF_ORDER_VI.notePlaceholder}
                      onChange={(event) =>
                        props.onCustomerNoteChange(event.target.value)
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <Separator />
          <div className="workflow-safe-pb flex shrink-0 flex-col gap-2 p-4">
            {props.submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{props.submitError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>{SELF_ORDER_VI.subtotal}</span>
              <span className="font-mono tabular-nums text-primary">
                {formatVND(total)}
              </span>
            </div>
            <Button
              type="button"
              size="touch-lg"
              className="w-full"
              disabled={submitDisabled}
              onClick={props.onSubmit}
            >
              {props.isSubmitting ? <Spinner className="size-4" /> : null}
              {props.isSubmitting ? SELF_ORDER_VI.submitting : ctaLabel}
            </Button>
            {ctaDisabled && ctaDisabledHint ? (
              <p className="text-center text-xs text-muted-foreground">
                {ctaDisabledHint}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {editingMenuItem && editingCartItem ? (
        <SelfOrderItemSheet
          item={editingMenuItem}
          open={editingKey != null}
          disabled={editingDisabled}
          initialDraft={editingCartItem}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditingKey(null);
          }}
          onCommit={(nextItem) => {
            props.onReplace(nextItem);
            setEditingKey(null);
          }}
        />
      ) : null}
    </>
  );
}
