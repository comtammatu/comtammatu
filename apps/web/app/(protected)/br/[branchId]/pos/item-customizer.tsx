"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { FieldLabel } from "@comtammatu/ui/components/field";

import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";
import { FormattedNumberInput } from "@/components/form";
import type { CartItem, CartModifier, CartSide } from "./types";
import type { MenuItem, MenuVariant } from "./pos-menu-types";
import { QuickReasonChips } from "./_components/quick-reason-chips";
import {
  ITEM_DISCOUNT_PRESETS,
  ITEM_NOTE_PRESETS,
} from "./_components/quick-reason-presets";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { StationSheet } from "@/components/surface";

interface ItemCustomizerProps {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (
    item: MenuItem,
    variantId: number | undefined,
    variantName: string | undefined,
    unitPrice: number,
    modifiers: CartModifier[],
    sides: CartSide[],
    note: string | undefined,
    quantity: number,
    discountType: "vnd" | undefined,
    discountValue: number | undefined,
    discountNote: string | undefined,
  ) => void;
  /**
   * - `new`: add an item to a new order's cart
   * - `append`: add an item to an already-sent order (append draft)
   * - `edit`: edit an item in the unsent cart
   * - `edit-sent`: edit an item already SENT to the kitchen while
   *   status='pending' (server-side gated). The parent calls the
   *   `editPendingOrderItem` server action after onConfirm fires. */
  mode?: "new" | "append" | "edit" | "edit-sent";
  appendOrderLabel?: string | null;
  initialCartItem?: CartItem | null;
}

export function ItemCustomizer({
  item,
  onClose,
  onConfirm,
  mode = "new",
  appendOrderLabel,
  initialCartItem,
}: ItemCustomizerProps) {
  const [selectedVariant, setSelectedVariant] = useState<MenuVariant | null>(
    null,
  );
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedSideIds, setSelectedSideIds] = useState<Set<number>>(
    new Set(),
  );
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountValueText, setDiscountValueText] = useState("");
  const [discountNote, setDiscountNote] = useState("");

  const resetStateForItem = useCallback(
    (nextItem: MenuItem, cartItem?: CartItem | null) => {
      if (cartItem) {
        setSelectedVariant(
          nextItem.menu_item_variants.find(
            (variant) => variant.id === cartItem.variant_id,
          ) ?? null,
        );
        setSelectedModifierIds(
          new Set(cartItem.modifiers.map((modifier) => modifier.modifier_id)),
        );
        setSelectedSideIds(
          new Set(cartItem.sides.map((side) => side.side_item_id)),
        );
        setNote(cartItem.note ?? "");
        setQuantity(cartItem.quantity);
        const hasDiscount =
          cartItem.discount_type === "vnd" &&
          cartItem.discount_value !== undefined;
        setDiscountEnabled(hasDiscount);
        setDiscountValueText(
          hasDiscount ? String(cartItem.discount_value) : "",
        );
        setDiscountNote(cartItem.discount_note ?? "");
        return;
      }

      setSelectedVariant(nextItem.menu_item_variants[0] ?? null);
      setSelectedModifierIds(new Set());
      setSelectedSideIds(
        new Set(
          nextItem.menu_item_available_sides
            .filter((s) => s.is_default)
            .map((s) => s.side_item.id),
        ),
      );
      setNote("");
      setQuantity(1);
      setDiscountEnabled(false);
      setDiscountValueText("");
      setDiscountNote("");
    },
    [],
  );

  useEffect(() => {
    if (item) {
      resetStateForItem(item, initialCartItem);
    }
  }, [initialCartItem, item, resetStateForItem]);

  const resetAndSetItem = useCallback(
    (open: boolean) => {
      if (open && item) {
        resetStateForItem(item, initialCartItem);
      }
      if (!open) {
        onClose();
      }
    },
    [initialCartItem, item, onClose, resetStateForItem],
  );

  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const base = item.base_price;
    const variantAdj = selectedVariant?.price_adjustment ?? 0;
    return base + variantAdj;
  }, [item, selectedVariant]);

  const modifierTotal = useMemo(() => {
    if (!item) return 0;
    return item.menu_item_modifiers
      .filter((m) => selectedModifierIds.has(m.id))
      .reduce((sum, m) => sum + m.price, 0);
  }, [item, selectedModifierIds]);

  const sideTotal = useMemo(() => {
    if (!item) return 0;
    return item.menu_item_available_sides
      .filter((s) => selectedSideIds.has(s.side_item.id))
      .reduce((sum, s) => sum + s.side_item.base_price, 0);
  }, [item, selectedSideIds]);

  const lineUnitPrice = unitPrice + modifierTotal + sideTotal;
  const totalPrice = lineUnitPrice * quantity;

  // Parse + clamp the typed discount value so the preview matches what the
  // server will store (mirrors compute_discount_amount).
  const discountValue = useMemo(() => {
    const trimmed = discountValueText.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, Math.max(totalPrice, 0));
  }, [discountValueText, totalPrice]);

  const discountAmount = useMemo(() => {
    if (!discountEnabled || discountValue <= 0 || totalPrice <= 0) return 0;
    return Math.min(discountValue, totalPrice);
  }, [discountEnabled, discountValue, totalPrice]);

  const netTotalPrice = Math.max(0, totalPrice - discountAmount);
  const discountNoteTrimLen = discountNote.trim().length;
  // When the discount section is on it must resolve to a real reduction with a
  // ≥3-char reason, mirroring the order_items_discount_metadata_paired DB rule.
  const discountValid =
    !discountEnabled || (discountAmount > 0 && discountNoteTrimLen >= 3);

  const handleConfirm = useCallback(() => {
    if (!item) return;
    if (discountEnabled && !discountValid) return;

    const modifiers: CartModifier[] = item.menu_item_modifiers
      .filter((m) => selectedModifierIds.has(m.id))
      .map((m) => ({ modifier_id: m.id, name: m.name, price: m.price }));

    const sides: CartSide[] = item.menu_item_available_sides
      .filter((s) => selectedSideIds.has(s.side_item.id))
      .map((s) => ({
        side_item_id: s.side_item.id,
        name: s.side_item.name,
        price: s.side_item.base_price,
        quantity: 1,
        is_default: s.is_default,
      }));

    const trimmedNote = note.trim();
    const trimmedDiscountNote = discountNote.trim();
    const applyDiscount =
      discountEnabled && discountAmount > 0 && trimmedDiscountNote.length >= 3;
    onConfirm(
      item,
      selectedVariant?.id,
      selectedVariant?.name,
      unitPrice,
      modifiers,
      sides,
      trimmedNote.length > 0 ? trimmedNote : undefined,
      quantity,
      applyDiscount ? "vnd" : undefined,
      applyDiscount ? discountValue : undefined,
      applyDiscount ? trimmedDiscountNote : undefined,
    );
  }, [
    item,
    selectedVariant,
    selectedModifierIds,
    selectedSideIds,
    unitPrice,
    note,
    quantity,
    onConfirm,
    discountEnabled,
    discountValid,
    discountAmount,
    discountValue,
    discountNote,
  ]);

  const toggleModifier = useCallback((modId: number) => {
    setSelectedModifierIds((prev) => {
      const next = new Set(prev);
      if (next.has(modId)) {
        next.delete(modId);
      } else {
        next.add(modId);
      }
      return next;
    });
  }, []);

  const toggleSide = useCallback((sideItemId: number) => {
    setSelectedSideIds((prev) => {
      const next = new Set(prev);
      if (next.has(sideItemId)) {
        next.delete(sideItemId);
      } else {
        next.add(sideItemId);
      }
      return next;
    });
  }, []);

  const updateQuantity = useCallback((delta: number) => {
    setQuantity((current) => Math.min(99, Math.max(1, current + delta)));
  }, []);

  const customizerDescription =
    item == null
      ? undefined
      : mode === "append" && appendOrderLabel
        ? messages.pos.customizer.appendOrderDescription(appendOrderLabel)
        : mode === "edit"
          ? messages.pos.customizer.editDescription
          : mode === "edit-sent"
            ? messages.pos.customizer.editSentDescription
            : (item.description ?? undefined);

  return (
    <StationSheet
      open={item !== null}
      onOpenChange={resetAndSetItem}
      title={item?.name ?? ""}
      description={customizerDescription}
      side="bottom"
      fullscreen
      contentClassName="overflow-hidden p-0"
      bodyClassName="flex flex-col gap-4 px-4 py-4"
      footerClassName="shrink-0 flex-col gap-2 p-3 pos-safe-bottom sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3"
      footer={
        item ? (
          <>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {FORM_VI.subtotal}
                </p>
                {discountAmount > 0 ? (
                  <p className="text-base font-bold text-primary tabular-nums sm:text-xl">
                    <span className="mr-1.5 text-xs font-normal text-muted-foreground line-through sm:text-sm">
                      {formatVND(totalPrice)}
                    </span>
                    {formatVND(netTotalPrice)}
                  </p>
                ) : (
                  <p className="text-base font-bold text-primary tabular-nums sm:text-xl">
                    {formatVND(totalPrice)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-touch"
                  disabled={quantity <= 1}
                  aria-label={messages.pos.customizer.decreaseQuantityAria}
                  onClick={() => updateQuantity(-1)}
                >
                  <IconMinus />
                </Button>
                <span className="w-7 text-center text-base font-bold tabular-nums">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-touch"
                  aria-label={messages.pos.customizer.increaseQuantityAria}
                  onClick={() => updateQuantity(1)}
                >
                  <IconPlus />
                </Button>
              </div>
            </div>
            <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
              {discountEnabled && !discountValid ? (
                <p className="text-right text-xs text-destructive sm:text-sm">
                  {messages.pos.customizer.discountHint}
                </p>
              ) : null}
              <Button
                size="touch"
                className="w-full font-semibold sm:w-auto sm:min-w-36"
                disabled={!discountValid}
                title={
                  discountEnabled && !discountValid
                    ? messages.pos.customizer.discountHint
                    : undefined
                }
                onClick={handleConfirm}
              >
                {mode === "append"
                  ? messages.pos.customizer.addToOrder
                  : mode === "edit"
                    ? messages.pos.customizer.update
                    : mode === "edit-sent"
                      ? messages.pos.customizer.updateSent
                      : messages.pos.customizer.addToCart}
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      {item ? (
        <>
              {item.menu_item_variants.length > 0 && (
                <div>
                  <h3 className="font-heading mb-2 text-base font-semibold">
                    {FORM_VI.type}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {item.menu_item_variants.map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      const price = item.base_price + v.price_adjustment;
                      return (
                        <Button
                          key={v.id}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="touch"
                          className={cn(
                            "justify-start text-base whitespace-normal",
                            isSelected ? "font-medium" : "hover:bg-accent",
                          )}
                          onClick={() => setSelectedVariant(v)}
                        >
                          <span>{v.name}</span>
                          <span className="ml-1.5 text-sm opacity-70">
                            {formatVND(price)}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {item.menu_item_modifiers.length > 0 && (
                <div>
                  <h3 className="font-heading mb-2 text-base font-semibold">
                    {ACTIONS_VI.add}
                  </h3>
                  <ItemGroup className="gap-2">
                    {item.menu_item_modifiers.map((m) => (
                      <Item
                        key={m.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        render={
                          <FieldLabel
                            htmlFor={`modifier-${m.id}`}
                            className="flex items-center gap-3 w-full font-normal cursor-pointer"
                          />
                        }
                      >
                        <Checkbox
                          id={`modifier-${m.id}`}
                          size="touch"
                          checked={selectedModifierIds.has(m.id)}
                          onCheckedChange={() => toggleModifier(m.id)}
                        />
                        <ItemContent>
                          <ItemTitle className="text-base">{m.name}</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-base text-muted-foreground">
                            +{formatVND(m.price)}
                          </span>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                </div>
              )}

              {item.menu_item_available_sides.length > 0 && (
                <div>
                  <h3 className="font-heading mb-2 text-base font-semibold">
                    {messages.pos.customizer.sides}
                  </h3>
                  <ItemGroup className="gap-2">
                    {item.menu_item_available_sides.map((s) => (
                      <Item
                        key={s.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        render={
                          <FieldLabel
                            htmlFor={`side-${String(s.id)}`}
                            className="flex items-center gap-3 w-full font-normal cursor-pointer"
                          />
                        }
                      >
                        <Checkbox
                          id={`side-${String(s.id)}`}
                          size="touch"
                          checked={selectedSideIds.has(s.side_item.id)}
                          onCheckedChange={() => toggleSide(s.side_item.id)}
                        />
                        <ItemContent>
                          <ItemTitle className="text-base">
                            <span>{s.side_item.name}</span>
                            {s.is_default && (
                              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                                {messages.pos.customizer.defaultSide}
                              </span>
                            )}
                          </ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-base text-muted-foreground">
                            +{formatVND(s.side_item.base_price)}
                          </span>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                </div>
              )}

              <div>
                <FieldLabel
                  htmlFor="item-note"
                  className="mb-2 text-base font-semibold"
                >
                  {FORM_VI.notes}
                </FieldLabel>
                <QuickReasonChips
                  presets={ITEM_NOTE_PRESETS}
                  value={note}
                  onChange={setNote}
                  ariaLabel={messages.pos.customizer.noteSuggestionsAria}
                  className="mb-2"
                />
                <Textarea
                  id="item-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={messages.pos.customizer.notePlaceholder}
                  rows={2}
                  maxLength={200}
                />
              </div>

              {/* Per-item discount stays out of edit-sent; sent items use the post-hoc item-discount flow. */}
              {mode !== "edit-sent" && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <FieldLabel
                      htmlFor="item-discount-toggle"
                      className="text-base font-semibold"
                    >
                      {messages.pos.customizer.discountLabel}
                    </FieldLabel>
                    <Checkbox
                      id="item-discount-toggle"
                      size="touch"
                      checked={discountEnabled}
                      onCheckedChange={(checked) =>
                        setDiscountEnabled(checked === true)
                      }
                    />
                  </div>
                  {discountEnabled && (
                    <div className="flex flex-col gap-3">
                      <FormattedNumberInput
                        id="item-discount-value"
                        maxFractionDigits={0}
                        value={discountValueText}
                        onValueChange={setDiscountValueText}
                        placeholder={
                          messages.pos.customizer.discountValuePlaceholderVnd
                        }
                      />
                      <QuickReasonChips
                        presets={ITEM_DISCOUNT_PRESETS}
                        value={discountNote}
                        onChange={setDiscountNote}
                        ariaLabel={
                          messages.pos.customizer.discountReasonSuggestionsAria
                        }
                      />
                      <Textarea
                        id="item-discount-note"
                        value={discountNote}
                        onChange={(e) => setDiscountNote(e.target.value)}
                        placeholder={
                          messages.pos.customizer.discountNotePlaceholder
                        }
                        rows={2}
                        maxLength={200}
                        aria-invalid={
                          discountEnabled && discountNoteTrimLen > 0
                            ? !discountValid
                            : undefined
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        {discountAmount > 0
                          ? messages.pos.customizer.discountPreview(
                              formatVND(discountAmount),
                              formatVND(netTotalPrice),
                            )
                          : messages.pos.customizer.discountHint}
                      </p>
                    </div>
                  )}
                </div>
              )}
          </>
        ) : null}
    </StationSheet>
  );
}
