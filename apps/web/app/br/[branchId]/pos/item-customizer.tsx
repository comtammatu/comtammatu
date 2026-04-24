"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
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
import type { CartModifier, CartSide } from "./types";
import type { MenuItem, MenuVariant } from "./pos-menu-types";

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
  ) => void;
  /** Thêm món vào đơn đã có (copy nút/tiêu đề) */
  mode?: "new" | "append";
  appendOrderLabel?: string | null;
}

export function ItemCustomizer({
  item,
  onClose,
  onConfirm,
  mode = "new",
  appendOrderLabel,
}: ItemCustomizerProps) {
  const [selectedVariant, setSelectedVariant] = useState<MenuVariant | null>(
    null,
  );
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedSideQuantities, setSelectedSideQuantities] = useState<
    Map<number, number>
  >(
    new Map(),
  );
  const [note, setNote] = useState("");

  // Reset state when item prop changes
  useEffect(() => {
    if (item) {
      setSelectedVariant(item.menu_item_variants[0] ?? null);
      setSelectedModifierIds(new Set());
      setSelectedSideQuantities(
        new Map(
          item.menu_item_available_sides
            .filter((s) => s.is_default)
            .map((s) => [s.side_item.id, 1] as const),
        ),
      );
      setNote("");
    }
  }, [item]);

  const resetAndSetItem = useCallback(
    (open: boolean) => {
      if (open && item) {
        // Pre-select first variant if variants exist
        const firstVariant = item.menu_item_variants[0];
        setSelectedVariant(firstVariant ?? null);
        setSelectedModifierIds(new Set());
        // Pre-select default sides
        const defaultSideQuantities = new Map(
          item.menu_item_available_sides
            .filter((s) => s.is_default)
            .map((s) => [s.side_item.id, 1] as const),
        );
        setSelectedSideQuantities(defaultSideQuantities);
        setNote("");
      }
      if (!open) {
        onClose();
      }
    },
    [item, onClose],
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

  const totalPrice = unitPrice + modifierTotal + sideTotal;

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
    );
  }, [
    item,
    selectedVariant,
    selectedModifierIds,
    selectedSideQuantities,
    unitPrice,
    note,
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

  const updateSideQuantity = useCallback((sideItemId: number, delta: number) => {
    setSelectedSideQuantities((prev) => {
      const current = prev.get(sideItemId);
      if (current == null) return prev;

      const nextQuantity = Math.min(99, Math.max(1, current + delta));
      if (nextQuantity === current) return prev;

      const next = new Map(prev);
      next.set(sideItemId, nextQuantity);
      return next;
    });
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
                )}
              >
                {mode === "append" && appendOrderLabel
                  ? `Thêm món vào đơn #${appendOrderLabel}`
                  : (item.description ??
                    "Tùy chọn món (biến thể, topping, món kèm)")}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1 px-4">
              <div className="flex flex-col gap-4 pb-4">
                {/* Variants */}
                {item.menu_item_variants.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Loại</h3>
                    <div className="flex flex-wrap gap-2">
                      {item.menu_item_variants.map((v) => {
                        const isSelected = selectedVariant?.id === v.id;
                        const price = item.base_price + v.price_adjustment;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={cn(
                              "rounded-lg border px-3 py-2 text-sm transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 font-medium text-primary"
                                : "border-border hover:bg-accent",
                            )}
                            onClick={() => setSelectedVariant(v)}
                          >
                            <span>{v.name}</span>
                            <span className="ml-1.5 text-xs opacity-70">
                              {formatVND(price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Modifiers */}
                {item.menu_item_modifiers.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Thêm</h3>
                    <div className="flex flex-col gap-2">
                      {item.menu_item_modifiers.map((m) => (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={selectedModifierIds.has(m.id)}
                            onCheckedChange={() => toggleModifier(m.id)}
                          />
                          <span className="flex-1 text-sm">{m.name}</span>
                          <span className="text-sm text-muted-foreground">
                            +{formatVND(m.price)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Sides */}
                {item.menu_item_available_sides.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Món kèm</h3>
                    <div className="flex flex-col gap-2">
                      {item.menu_item_available_sides.map((s) => {
                        const sideQuantity = selectedSideQuantities.get(
                          s.side_item.id,
                        );
                        const isSelected = sideQuantity != null;

                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent"
                          >
                            <Checkbox
                              id={`side-${String(s.id)}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleSide(s.side_item.id)}
                            />
                            <Label
                              htmlFor={`side-${String(s.id)}`}
                              className="min-w-0 flex-1 cursor-pointer text-sm font-normal"
                            >
                              {s.side_item.name}
                              {s.is_default && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  (mặc định)
                                </span>
                              )}
                            </Label>
                            {isSelected && (
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-8"
                                  disabled={sideQuantity <= 1}
                                  aria-label={`Giảm ${s.side_item.name}`}
                                  onClick={() =>
                                    updateSideQuantity(s.side_item.id, -1)
                                  }
                                >
                                  -
                                </Button>
                                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                                  {sideQuantity}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Tăng ${s.side_item.name}`}
                                  onClick={() =>
                                    updateSideQuantity(s.side_item.id, 1)
                                  }
                                >
                                  +
                                </Button>
                              </div>
                            )}
                            <span className="shrink-0 text-sm text-muted-foreground">
                              +{formatVND(s.side_item.base_price)}
                              {isSelected && sideQuantity > 1
                                ? ` x${String(sideQuantity)}`
                                : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Note */}
                <div>
                  <Label htmlFor="item-note" className="mb-2 text-sm font-semibold">
                    Ghi chú
                  </Label>
                  <Textarea
                    id="item-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: ít cay, không hành..."
                    rows={2}
                    maxLength={200}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <Separator />
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Đơn giá</p>
                <p className="text-lg font-bold text-primary">
                  {formatVND(totalPrice)}
                </p>
              </div>
              <Button
                size="lg"
                className="min-h-11 min-w-40"
                onClick={handleConfirm}
              >
                {mode === "append" ? "Thêm vào đơn" : "Thêm vào giỏ"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
