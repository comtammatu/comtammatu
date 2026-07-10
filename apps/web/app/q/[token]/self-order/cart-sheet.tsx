"use client";

import { useState } from "react";
import {
  Minus as IconMinus,
  Plus as IconPlus,
  ShoppingCart as IconCart,
  Trash2 as IconTrash,
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
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import type { SelfOrderCartItem } from "@lib/self-order/contracts";

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
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      side.quantity > 1 ? `${side.quantity}x ${side.name}` : side.name,
    ),
    item.note ? `${SELF_ORDER_VI.itemNoteLabel}: ${item.note}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface CartSheetProps {
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
  onSubmit: () => void;
}

function CartLines({
  items,
  disabled,
  onQuantityChange,
  onRemove,
}: Pick<CartSheetProps, "items" | "onQuantityChange" | "onRemove"> & {
  disabled: boolean;
}) {
  return (
    <ItemGroup data-size="xs">
      {items.map((item) => (
        <CartLine
          key={item.key}
          item={item}
          disabled={disabled}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      ))}
    </ItemGroup>
  );
}

function CartLine({
  item,
  disabled,
  onQuantityChange,
  onRemove,
}: {
  item: SelfOrderCartItem;
  disabled: boolean;
  onQuantityChange: CartSheetProps["onQuantityChange"];
  onRemove: CartSheetProps["onRemove"];
}) {
  const optionSummary = cartOptionSummary(item);

  return (
    <Item
      variant="outline"
      size="xs"
      className="flex-col items-stretch justify-between sm:flex-row sm:items-center"
    >
      <ItemContent>
        <ItemTitle className="text-sm">
          {item.variant_name
            ? `${item.item_name} ${item.variant_name}`
            : item.item_name}
        </ItemTitle>
        <ItemDescription>{formatVND(lineTotal(item))}</ItemDescription>
        {optionSummary ? (
          <ItemDescription className="line-clamp-3">
            {optionSummary}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="w-full justify-end gap-2 sm:w-auto">
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
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
          size="icon-touch"
          disabled={disabled}
          onClick={() => onQuantityChange(item.key, 1)}
          aria-label={`${SELF_ORDER_VI.increaseQuantityAria}: ${item.item_name}`}
        >
          <IconPlus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          disabled={disabled}
          onClick={() => onRemove(item.key)}
          aria-label={`${SELF_ORDER_VI.removeItem}: ${item.item_name}`}
        >
          <IconTrash />
        </Button>
      </ItemActions>
    </Item>
  );
}

function NoteField({
  customerNote,
  disabled,
  onCustomerNoteChange,
}: Pick<CartSheetProps, "customerNote" | "onCustomerNoteChange"> & {
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="self-order-note">{SELF_ORDER_VI.noteLabel}</Label>
      <Textarea
        id="self-order-note"
        name="customerNote"
        autoComplete="off"
        value={customerNote}
        disabled={disabled}
        maxLength={500}
        rows={2}
        placeholder={SELF_ORDER_VI.notePlaceholder}
        onChange={(event) => onCustomerNoteChange(event.target.value)}
      />
    </div>
  );
}

function SubmitCta({
  isSubmitting,
  canSubmit,
  ctaDisabled,
  ctaLabel,
  ctaDisabledHint,
  onSubmit,
}: Pick<
  CartSheetProps,
  | "isSubmitting"
  | "canSubmit"
  | "ctaDisabled"
  | "ctaLabel"
  | "ctaDisabledHint"
  | "onSubmit"
>) {
  const disabled = !canSubmit || isSubmitting || ctaDisabled;
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="touch-lg"
        className="w-full"
        disabled={disabled}
        onClick={onSubmit}
      >
        {isSubmitting ? <Spinner className="size-4" /> : null}
        {isSubmitting ? SELF_ORDER_VI.submitting : ctaLabel}
      </Button>
      {ctaDisabled && ctaDisabledHint ? (
        <p className="text-center text-xs text-muted-foreground">
          {ctaDisabledHint}
        </p>
      ) : null}
    </div>
  );
}

export function CartSheet(props: CartSheetProps) {
  const {
    items,
    total,
    quantity,
    customerNote,
    ctaLabel,
    ctaDisabled,
    ctaDisabledHint,
  } = props;
  const [open, setOpen] = useState(false);
  const empty = items.length === 0;
  const editingDisabled = props.isSubmitting || props.isEditingLocked;

  const subtotalRow = (
    <div className="flex items-center justify-between text-sm font-semibold">
      <span>{SELF_ORDER_VI.subtotal}</span>
      <span className="tabular-nums">{formatVND(total)}</span>
    </div>
  );

  const submitCta = (
    <SubmitCta
      isSubmitting={props.isSubmitting}
      canSubmit={props.canSubmit}
      ctaDisabled={ctaDisabled}
      ctaLabel={ctaLabel}
      ctaDisabledHint={ctaDisabledHint}
      onSubmit={props.onSubmit}
    />
  );

  return (
    <>
      {!empty ? (
        <div className="workflow-safe-pb fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-2xl flex-col gap-2 border-t border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
          {props.submitError ? (
            <Alert variant="destructive">
              <AlertDescription>{props.submitError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2 sm:flex-1">
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="min-w-12 shrink-0 px-2"
                onClick={() => setOpen(true)}
                aria-label={SELF_ORDER_VI.cartTitle}
              >
                <IconCart />
                <Badge variant="secondary">{quantity}</Badge>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="h-auto min-w-0 flex-1 justify-start px-2 py-1 text-left"
                onClick={() => setOpen(true)}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="text-xs text-muted-foreground">
                    {SELF_ORDER_VI.subtotal}
                  </span>
                  <span className="font-mono text-base font-bold tabular-nums text-primary">
                    {formatVND(total)}
                  </span>
                </span>
              </Button>
            </div>
            <Button
              type="button"
              size="touch-lg"
              className="w-full sm:min-w-28 sm:w-auto"
              disabled={!props.canSubmit || props.isSubmitting || ctaDisabled}
              onClick={props.onSubmit}
            >
              {props.isSubmitting ? <Spinner className="size-4" /> : null}
              {props.isSubmitting ? SELF_ORDER_VI.submitting : ctaLabel}
            </Button>
          </div>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-dvh-95 w-full max-w-2xl p-0"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconCart className="size-4" />
              {SELF_ORDER_VI.cartTitle}
              {quantity > 0 ? (
                <Badge variant="secondary">{quantity}</Badge>
              ) : null}
            </SheetTitle>
            <SheetDescription>
              {empty
                ? SELF_ORDER_VI.cartEmpty
                : SELF_ORDER_VI.cartReviewDescription}
            </SheetDescription>
          </SheetHeader>
          <div className="flex max-h-dvh-80 flex-col gap-3 overflow-y-auto p-3">
            {empty ? (
              <Item variant="outline" className="border-dashed">
                <ItemDescription>{SELF_ORDER_VI.cartEmpty}</ItemDescription>
              </Item>
            ) : (
              <>
                <CartLines
                  items={items}
                  disabled={editingDisabled}
                  onQuantityChange={props.onQuantityChange}
                  onRemove={props.onRemove}
                />
                <NoteField
                  customerNote={customerNote}
                  disabled={editingDisabled}
                  onCustomerNoteChange={props.onCustomerNoteChange}
                />
                {subtotalRow}
              </>
            )}
          </div>
          <div className="workflow-safe-pb flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background p-3">
            {props.submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{props.submitError}</AlertDescription>
              </Alert>
            ) : null}
            {subtotalRow}
            {submitCta}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
