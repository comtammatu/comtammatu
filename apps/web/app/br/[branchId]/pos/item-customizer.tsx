"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import { cn } from "@comtammatu/ui";
import type { CartItem, CartModifier, CartSide } from "./types";
import type { MenuItem, MenuVariant } from "./pos-menu-types";
import { QuickReasonChips } from "./_components/quick-reason-chips";
import { ITEM_NOTE_PRESETS } from "./_components/quick-reason-presets";

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
  ) => void;
  /**
   * - `new`: thêm món vào giỏ đơn mới
   * - `append`: thêm món vào đơn đã gửi (append draft)
   * - `edit`: sửa món trong giỏ chưa gửi
   * - `edit-sent`: sửa món ĐÃ GỬI bếp khi status='pending' (server-side gated).
   *   Parent gọi `editPendingOrderItem` server action sau khi onConfirm fire. */
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
    },
    [],
  );

  // Reset state when item prop changes
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

  const handleConfirm = useCallback(() => {
    if (!item) return;

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
    onConfirm(
      item,
      selectedVariant?.id,
      selectedVariant?.name,
      unitPrice,
      modifiers,
      sides,
      trimmedNote.length > 0 ? trimmedNote : undefined,
      quantity,
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
        if (current == null) return prev;

        const nextQuantity = Math.min(99, Math.max(1, current + delta));
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
      <SheetContent side="bottom" className="h-dvh max-h-dvh p-0">
        {item && (
          <div className="flex h-full flex-col">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle className="text-left">{item.name}</SheetTitle>
              <SheetDescription
                className={cn(
                  "text-left",
                  mode === "new" && !item.description && "sr-only",
                  mode === "edit" && "sr-only",
                )}
              >
                {mode === "append" && appendOrderLabel
                  ? `Đơn #${appendOrderLabel}`
                  : mode === "edit"
                    ? "Sửa món trong giỏ"
                    : mode === "edit-sent"
                      ? "Sửa món đã gửi (chưa làm)"
                      : (item.description ?? "Tùy chọn món")}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-4 px-4 pb-4">
                {/* Variants */}
                {item.menu_item_variants.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-base font-semibold">{FORM_VI.type}</h3>
                    <div className="flex flex-wrap gap-2">
                      {item.menu_item_variants.map((v) => {
                        const isSelected = selectedVariant?.id === v.id;
                        const price = item.base_price + v.price_adjustment;
                        return (
                          <Button
                            key={v.id}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            className={cn(
                              "h-auto justify-start px-3 py-2 text-base whitespace-normal",
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

                {/* Modifiers */}
                {item.menu_item_modifiers.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-base font-semibold">{ACTIONS_VI.add}</h3>
                    <div className="flex flex-col gap-2">
                      {item.menu_item_modifiers.map((m) => (
                        <Item
                          key={m.id}
                          asChild
                          variant="outline"
                          className="cursor-pointer hover:bg-accent"
                        >
                          <label>
                            <Checkbox
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
                          </label>
                        </Item>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Sides */}
                {item.menu_item_available_sides.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-base font-semibold">Món kèm</h3>
                    <div className="flex flex-col gap-2">
                      {item.menu_item_available_sides.map((s) => {
                        const sideQuantity = selectedSideQuantities.get(
                          s.side_item.id,
                        );
                        const isSelected = sideQuantity != null;
                        const displaySideQuantity = sideQuantity ?? 1;
                        const sideLineTotal =
                          s.side_item.base_price * displaySideQuantity;

                        return (
                          <Item
                            key={s.id}
                            variant="outline"
                            className="hover:bg-accent"
                          >
                            <Checkbox
                              id={`side-${String(s.id)}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleSide(s.side_item.id)}
                            />
                            <Label
                              htmlFor={`side-${String(s.id)}`}
                              className="min-w-0 flex-1 cursor-pointer text-base font-normal"
                            >
                              {s.side_item.name}
                              {s.is_default && (
                                <span className="ml-1 text-sm text-muted-foreground">
                                  (mặc định)
                                </span>
                              )}
                            </Label>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="w-20 text-right text-base font-medium tabular-nums">
                                +{formatVND(sideLineTotal)}
                              </span>
                              <div className="flex w-24 items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-11"
                                  disabled={
                                    !isSelected || displaySideQuantity <= 1
                                  }
                                  aria-label={`Giảm ${s.side_item.name}`}
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
                                  size="icon"
                                  className="size-11"
                                  disabled={!isSelected}
                                  aria-label={`Tăng ${s.side_item.name}`}
                                  onClick={() =>
                                    updateSideQuantity(s.side_item.id, 1)
                                  }
                                >
                                  +
                                </Button>
                              </div>
                            </div>
                          </Item>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Note */}
                <div>
                  <Label
                    htmlFor="item-note"
                    className="mb-2 text-base font-semibold"
                  >
                    {FORM_VI.notes}
                  </Label>
                  <QuickReasonChips
                    presets={ITEM_NOTE_PRESETS}
                    value={note}
                    onChange={setNote}
                    ariaLabel="Gợi ý ghi chú món"
                    className="mb-2"
                  />
                  <Textarea
                    id="item-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ghi chú thêm..."
                    rows={2}
                    maxLength={200}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <Separator />
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm text-muted-foreground">{FORM_VI.subtotal}</p>
                <p className="text-xl font-bold text-primary tabular-nums">
                  {formatVND(totalPrice)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  disabled={quantity <= 1}
                  aria-label="Giảm số lượng"
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
                  size="icon"
                  className="size-11"
                  aria-label="Tăng số lượng"
                  onClick={() => updateQuantity(1)}
                >
                  +
                </Button>
              </div>
              <Button
                size="lg"
                className="min-h-11 min-w-32"
                onClick={handleConfirm}
              >
                {mode === "append"
                  ? "Thêm vào đơn"
                  : mode === "edit"
                    ? "Cập nhật"
                    : mode === "edit-sent"
                      ? "Cập nhật món đã gửi"
                      : "Thêm vào giỏ"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
