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
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { FieldLabel } from "@comtammatu/ui/components/field";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { X as IconX } from "lucide-react";
import { FormattedNumberInput } from "@/components/form";
import type { CartItem, CartModifier, CartSide } from "./types";
import type { MenuItem, MenuVariant } from "./pos-menu-types";
import { QuickReasonChips } from "./_components/quick-reason-chips";
import {
  ITEM_DISCOUNT_PRESETS,
  ITEM_NOTE_PRESETS,
} from "./_components/quick-reason-presets";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
    discountType: "pct" | "vnd" | undefined,
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
  const [selectedSideQuantities, setSelectedSideQuantities] = useState<
    Map<number, number>
  >(new Map());
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "vnd">("pct");
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
        setSelectedSideQuantities(
          new Map(
            cartItem.sides.map(
              (side) => [side.side_item_id, side.quantity] as const,
            ),
          ),
        );
        setNote(cartItem.note ?? "");
        setQuantity(cartItem.quantity);
        const hasDiscount =
          cartItem.discount_type !== undefined &&
          cartItem.discount_value !== undefined;
        setDiscountEnabled(hasDiscount);
        setDiscountType(cartItem.discount_type ?? "pct");
        setDiscountValueText(
          hasDiscount ? String(cartItem.discount_value) : "",
        );
        setDiscountNote(cartItem.discount_note ?? "");
        return;
      }

      setSelectedVariant(nextItem.menu_item_variants[0] ?? null);
      setSelectedModifierIds(new Set());
      setSelectedSideQuantities(
        new Map(
          nextItem.menu_item_available_sides
            .filter((s) => s.is_default)
            .map((s) => [s.side_item.id, 1] as const),
        ),
      );
      setNote("");
      setQuantity(1);
      setDiscountEnabled(false);
      setDiscountType("pct");
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
      .filter((s) => selectedSideQuantities.has(s.side_item.id))
      .reduce(
        (sum, s) =>
          sum +
          s.side_item.base_price *
            (selectedSideQuantities.get(s.side_item.id) ?? 1),
        0,
      );
  }, [item, selectedSideQuantities]);

  const lineUnitPrice = unitPrice + modifierTotal + sideTotal;
  const totalPrice = lineUnitPrice * quantity;

  // Parse + clamp the typed discount value so the preview matches what the
  // server will store (mirrors compute_discount_amount).
  const discountValue = useMemo(() => {
    const trimmed = discountValueText.trim().replace(",", ".");
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (discountType === "pct") return Math.min(n, 100);
    return Math.min(n, Math.max(totalPrice, 0));
  }, [discountValueText, discountType, totalPrice]);

  const discountAmount = useMemo(() => {
    if (!discountEnabled || discountValue <= 0 || totalPrice <= 0) return 0;
    if (discountType === "pct") {
      return Math.floor((totalPrice * discountValue) / 100);
    }
    return Math.min(discountValue, totalPrice);
  }, [discountEnabled, discountValue, discountType, totalPrice]);

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
      .filter((s) => selectedSideQuantities.has(s.side_item.id))
      .map((s) => ({
        side_item_id: s.side_item.id,
        name: s.side_item.name,
        price: s.side_item.base_price,
        quantity: selectedSideQuantities.get(s.side_item.id) ?? 1,
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
      applyDiscount ? discountType : undefined,
      applyDiscount ? discountValue : undefined,
      applyDiscount ? trimmedDiscountNote : undefined,
    );
  }, [
    item,
    selectedVariant,
    selectedModifierIds,
    selectedSideQuantities,
    unitPrice,
    note,
    quantity,
    onConfirm,
    discountEnabled,
    discountValid,
    discountAmount,
    discountType,
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
    setSelectedSideQuantities((prev) => {
      const next = new Map(prev);
      if (next.has(sideItemId)) {
        next.delete(sideItemId);
      } else {
        next.set(sideItemId, 1);
      }
      return next;
    });
  }, []);

  const updateSideQuantity = useCallback(
    (sideItemId: number, delta: number) => {
      setSelectedSideQuantities((prev) => {
        const current = prev.get(sideItemId);
        if (current == null) {
          if (delta <= 0) return prev;

          const next = new Map(prev);
          next.set(sideItemId, 1);
          return next;
        }

        const nextQuantity = Math.min(99, current + delta);
        if (nextQuantity <= 0) {
          const next = new Map(prev);
          next.delete(sideItemId);
          return next;
        }
        if (nextQuantity === current) return prev;

        const next = new Map(prev);
        next.set(sideItemId, nextQuantity);
        return next;
      });
    },
    [],
  );

  const updateQuantity = useCallback((delta: number) => {
    setQuantity((current) => Math.min(99, Math.max(1, current + delta)));
  }, []);

  return (
    <Sheet open={item !== null} onOpenChange={resetAndSetItem}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-dvh max-h-dvh p-0"
      >
        {item && (
          <div className="flex h-full flex-col">
            <SheetHeader>
              <div className="flex items-center justify-between gap-3">
                <SheetTitle className="min-w-0 flex-1 truncate text-left">
                  {item.name}
                </SheetTitle>
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground"
                    aria-label={messages.pos.customizer.closeAria}
                  >
                    <IconX />
                  </Button>
                </SheetClose>
              </div>
              <SheetDescription
                className={cn(
                  "text-left",
                  mode === "new" && !item.description && "sr-only",
                  mode === "edit" && "sr-only",
                )}
              >
                {mode === "append" && appendOrderLabel
                  ? messages.pos.customizer.appendOrderDescription(
                      appendOrderLabel,
                    )
                  : mode === "edit"
                    ? messages.pos.customizer.editDescription
                    : mode === "edit-sent"
                      ? messages.pos.customizer.editSentDescription
                      : (item.description ??
                        messages.pos.customizer.defaultDescription)}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-4 px-4 pb-4">
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
                          asChild
                          variant="outline"
                          className="cursor-pointer hover:bg-accent"
                        >
                          <FieldLabel
                            htmlFor={`modifier-${m.id}`}
                            className="flex items-center gap-3 w-full font-normal cursor-pointer"
                          >
                            <Checkbox
                              id={`modifier-${m.id}`}
                              checked={selectedModifierIds.has(m.id)}
                              onCheckedChange={() => toggleModifier(m.id)}
                            />
                            <ItemContent>
                              <ItemTitle className="text-base">
                                {m.name}
                              </ItemTitle>
                            </ItemContent>
                            <ItemActions>
                              <span className="text-base text-muted-foreground">
                                +{formatVND(m.price)}
                              </span>
                            </ItemActions>
                          </FieldLabel>
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
                      {item.menu_item_available_sides.map((s) => {
                        const sideQuantity = selectedSideQuantities.get(
                          s.side_item.id,
                        );
                        const isSelected = sideQuantity != null;
                        const displaySideQuantity = sideQuantity ?? 0;
                        const sideLineTotal =
                          s.side_item.base_price * displaySideQuantity;

                        return (
                          <Item
                            key={s.id}
                            variant="outline"
                            className="flex-nowrap items-start gap-3 hover:bg-accent"
                          >
                            <Checkbox
                              id={`side-${String(s.id)}`}
                              className="mt-1.5"
                              checked={isSelected}
                              onCheckedChange={() => toggleSide(s.side_item.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <FieldLabel
                                htmlFor={`side-${String(s.id)}`}
                                className="block cursor-pointer text-base leading-snug font-normal whitespace-normal"
                              >
                                <span className="break-words">
                                  {s.side_item.name}
                                </span>
                                {s.is_default && (
                                  <span className="ml-1 text-sm text-muted-foreground">
                                    {messages.pos.customizer.defaultSide}
                                  </span>
                                )}
                              </FieldLabel>
                              <span className="mt-1 block text-base font-medium tabular-nums text-muted-foreground">
                                +{formatVND(sideLineTotal)}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center justify-end gap-1 self-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="touch"
                                className="min-w-12 px-0"
                                aria-label={messages.pos.customizer.decreaseSideAria(
                                  s.side_item.name,
                                )}
                                onClick={() =>
                                  updateSideQuantity(s.side_item.id, -1)
                                }
                              >
                                -
                              </Button>
                              <span
                                className={cn(
                                  "w-6 text-center text-base font-semibold tabular-nums",
                                  !isSelected && "text-muted-foreground",
                                )}
                              >
                                {displaySideQuantity}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="touch"
                                className="min-w-12 px-0"
                                aria-label={messages.pos.customizer.increaseSideAria(
                                  s.side_item.name,
                                )}
                                onClick={() =>
                                  updateSideQuantity(s.side_item.id, 1)
                                }
                              >
                                +
                              </Button>
                            </div>
                          </Item>
                        );
                      })}
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
                        checked={discountEnabled}
                        onCheckedChange={(checked) =>
                          setDiscountEnabled(checked === true)
                        }
                      />
                    </div>
                    {discountEnabled && (
                      <div className="flex flex-col gap-3">
                        <Tabs
                          value={discountType}
                          onValueChange={(v) => {
                            setDiscountType(v as "pct" | "vnd");
                            setDiscountValueText("");
                          }}
                        >
                          <TabsList className="w-full">
                            <TabsTrigger value="pct" className="flex-1">
                              {messages.pos.customizer.discountByPercent}
                            </TabsTrigger>
                            <TabsTrigger value="vnd" className="flex-1">
                              {messages.pos.customizer.discountByVnd}
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <FormattedNumberInput
                          id="item-discount-value"
                          maxFractionDigits={discountType === "pct" ? 2 : 0}
                          value={discountValueText}
                          onValueChange={setDiscountValueText}
                          placeholder={
                            discountType === "pct"
                              ? messages.pos.customizer
                                  .discountValuePlaceholderPct
                              : messages.pos.customizer
                                  .discountValuePlaceholderVnd
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
              </div>
            </ScrollArea>

            <Separator />
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {FORM_VI.subtotal}
                </p>
                {discountAmount > 0 ? (
                  <p className="text-xl font-bold text-primary tabular-nums">
                    <span className="mr-2 text-sm font-normal text-muted-foreground line-through">
                      {formatVND(totalPrice)}
                    </span>
                    {formatVND(netTotalPrice)}
                  </p>
                ) : (
                  <p className="text-xl font-bold text-primary tabular-nums">
                    {formatVND(totalPrice)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="min-w-12 px-0"
                  disabled={quantity <= 1}
                  aria-label={messages.pos.customizer.decreaseQuantityAria}
                  onClick={() => updateQuantity(-1)}
                >
                  -
                </Button>
                <span className="w-7 text-center text-base font-bold tabular-nums">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="min-w-12 px-0"
                  aria-label={messages.pos.customizer.increaseQuantityAria}
                  onClick={() => updateQuantity(1)}
                >
                  +
                </Button>
              </div>
              <div className="flex flex-col items-end gap-1">
                {discountEnabled && !discountValid ? (
                  <p className="text-right text-sm text-muted-foreground">
                    {messages.pos.customizer.discountHint}
                  </p>
                ) : null}
                <Button
                  size="touch"
                  className="min-w-32"
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
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
