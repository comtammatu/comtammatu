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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@comtammatu/ui/components/sheet";
import { Textarea } from "@comtammatu/ui/components/textarea";
import type { SelfOrderCartItem } from "@lib/self-order/contracts";

function lineTotal(item: SelfOrderCartItem) {
  const modifierTotal = item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
  const sideTotal = item.sides.reduce((sum, side) => sum + side.price * side.quantity, 0);
  return (item.unit_price + modifierTotal + sideTotal) * item.quantity;
}

export interface CartSheetProps {
  items: SelfOrderCartItem[];
  total: number;
  quantity: number;
  isSubmitting: boolean;
  canSubmit: boolean;
  ctaLabel: string;
  ctaDisabled: boolean;
  ctaDisabledHint: string | null;
  customerNote: string;
  onCustomerNoteChange: (value: string) => void;
  onQuantityChange: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
}

function CartLines({
  items,
  onQuantityChange,
  onRemove,
}: Pick<CartSheetProps, "items" | "onQuantityChange" | "onRemove">) {
  return (
    <ItemGroup data-size="xs">
      {items.map((item) => (
        <Item key={item.key} variant="outline" size="xs" className="justify-between">
          <ItemContent>
            <ItemTitle className="text-sm">
              {item.variant_name ? `${item.item_name} ${item.variant_name}` : item.item_name}
            </ItemTitle>
            <ItemDescription>{formatVND(lineTotal(item))}</ItemDescription>
          </ItemContent>
          <ItemActions className="gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => onQuantityChange(item.key, -1)} aria-label="decrease">
              <IconMinus />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {item.quantity}
            </span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => onQuantityChange(item.key, 1)} aria-label="increase">
              <IconPlus />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(item.key)} aria-label={SELF_ORDER_VI.removeItem}>
              <IconTrash />
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function NoteField({
  customerNote,
  onCustomerNoteChange,
}: Pick<CartSheetProps, "customerNote" | "onCustomerNoteChange">) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="self-order-note">{SELF_ORDER_VI.noteLabel}</Label>
      <Textarea
        id="self-order-note"
        value={customerNote}
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
}: Pick<CartSheetProps, "isSubmitting" | "canSubmit" | "ctaDisabled" | "ctaLabel" | "ctaDisabledHint" | "onSubmit">) {
  const disabled = !canSubmit || isSubmitting || ctaDisabled;
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="touch-lg" className="w-full" disabled={disabled} onClick={onSubmit}>
        {isSubmitting ? SELF_ORDER_VI.submitting : ctaLabel}
      </Button>
      {ctaDisabled && ctaDisabledHint ? (
        <p className="text-center text-xs text-muted-foreground">{ctaDisabledHint}</p>
      ) : null}
    </div>
  );
}

export function CartSheet(props: CartSheetProps) {
  const { items, total, quantity, customerNote, ctaLabel, ctaDisabled, ctaDisabledHint } = props;
  const [open, setOpen] = useState(false);
  const empty = items.length === 0;

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
      {/* Mobile: FAB opens bottom sheet */}
      <Button
        type="button"
        variant="default"
        size="icon-touch"
        className="fixed right-3 bottom-24 z-40 rounded-full shadow-lg lg:hidden"
        aria-label={SELF_ORDER_VI.cartTitle}
        onClick={() => setOpen(true)}
      >
        <IconCart />
        {quantity > 0 ? (
          <Badge variant="warning" className="absolute -right-1 -top-1">
            {quantity}
          </Badge>
        ) : null}
      </Button>

      {/* Mobile: sticky bottom action bar (subtotal + CTA), always visible above FAB */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border/60 bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="min-w-12 shrink-0 px-2"
          onClick={() => setOpen(true)}
          aria-label={SELF_ORDER_VI.cartTitle}
        >
          <IconCart />
          {quantity > 0 ? <Badge variant="secondary">{quantity}</Badge> : null}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{SELF_ORDER_VI.subtotal}</p>
          <p className="font-mono text-base font-bold tabular-nums text-primary">{formatVND(total)}</p>
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            size="touch-lg"
            disabled={!props.canSubmit || props.isSubmitting || ctaDisabled}
            onClick={props.onSubmit}
          >
            {props.isSubmitting ? SELF_ORDER_VI.submitting : ctaLabel}
          </Button>
        </div>
      </div>

      {/* Mobile: bottom sheet (full cart editing) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-dvh-95 p-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconCart className="size-4" />
              {SELF_ORDER_VI.cartTitle}
              {quantity > 0 ? <Badge variant="secondary">{quantity}</Badge> : null}
            </SheetTitle>
            <SheetDescription>{SELF_ORDER_VI.cartEmpty}</SheetDescription>
          </SheetHeader>
          <div className="flex max-h-dvh-80 flex-col gap-3 overflow-y-auto p-3">
            {empty ? (
              <Item variant="outline" className="border-dashed">
                <ItemDescription>{SELF_ORDER_VI.cartEmpty}</ItemDescription>
              </Item>
            ) : (
              <>
                <CartLines items={items} onQuantityChange={props.onQuantityChange} onRemove={props.onRemove} />
                <NoteField customerNote={customerNote} onCustomerNoteChange={props.onCustomerNoteChange} />
                {subtotalRow}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background p-3">
            {subtotalRow}
            {submitCta}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop (lg+): always-visible aside cart, pinned subtotal+CTA at bottom */}
      <section className="hidden flex-col gap-3 lg:flex">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
            <IconCart className="size-4" />
            {SELF_ORDER_VI.cartTitle}
          </h2>
          {quantity > 0 ? <Badge variant="secondary">{quantity}</Badge> : null}
        </div>
        {empty ? (
          <Item variant="outline" className="border-dashed">
            <ItemDescription>{SELF_ORDER_VI.cartEmpty}</ItemDescription>
          </Item>
        ) : (
          <div className="flex flex-col gap-2">
            <CartLines items={items} onQuantityChange={props.onQuantityChange} onRemove={props.onRemove} />
            <NoteField customerNote={customerNote} onCustomerNoteChange={props.onCustomerNoteChange} />
          </div>
        )}
        <div className="sticky bottom-0 -mx-3 flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background px-3 py-3">
          {subtotalRow}
          {submitCta}
        </div>
      </section>
    </>
  );
}
