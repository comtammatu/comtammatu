"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import { cn } from "@comtammatu/ui";
import type { CartModifier, CartSide } from "./types";
import type { MenuItem, MenuVariant } from "./pos-menu";

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
  ) => void;
  formatVnd: (amount: number) => string;
}

export function ItemCustomizer({
  item,
  onClose,
  onConfirm,
  formatVnd,
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

  // Reset state when item changes
  const resetAndSetItem = useCallback(
    (open: boolean) => {
      if (open && item) {
        // Pre-select first variant if variants exist
        const firstVariant = item.menu_item_variants[0];
        setSelectedVariant(firstVariant ?? null);
        setSelectedModifierIds(new Set());
        // Pre-select default sides
        const defaultSideIds = new Set(
          item.menu_item_available_sides
            .filter((s) => s.is_default)
            .map((s) => s.side_item.id),
        );
        setSelectedSideIds(defaultSideIds);
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

  const totalPrice = unitPrice + modifierTotal;

  const handleConfirm = useCallback(() => {
    if (!item) return;

    const modifiers: CartModifier[] = item.menu_item_modifiers
      .filter((m) => selectedModifierIds.has(m.id))
      .map((m) => ({ modifier_id: m.id, name: m.name, price: m.price }));

    const sides: CartSide[] = item.menu_item_available_sides
      .filter((s) => selectedSideIds.has(s.side_item.id))
      .map((s) => ({
        side_item_id: s.side_item.id,
        name: s.side_item.name,
        is_default: s.is_default,
      }));

    onConfirm(
      item,
      selectedVariant?.id,
      selectedVariant?.name,
      unitPrice,
      modifiers,
      sides,
    );
  }, [
    item,
    selectedVariant,
    selectedModifierIds,
    selectedSideIds,
    unitPrice,
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

  return (
    <Sheet open={item !== null} onOpenChange={resetAndSetItem}>
      <SheetContent side="bottom" className="h-[70dvh] p-0">
        {item && (
          <div className="flex h-full flex-col">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle className="text-left">{item.name}</SheetTitle>
              {item.description && (
                <SheetDescription className="text-left">
                  {item.description}
                </SheetDescription>
              )}
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
                              {formatVnd(price)}
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
                            +{formatVnd(m.price)}
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
                      {item.menu_item_available_sides.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={selectedSideIds.has(s.side_item.id)}
                            onCheckedChange={() => toggleSide(s.side_item.id)}
                          />
                          <span className="flex-1 text-sm">
                            {s.side_item.name}
                            {s.is_default && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (mặc định)
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <Separator />
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Đơn giá</p>
                <p className="text-lg font-bold text-primary">
                  {formatVnd(totalPrice)}
                </p>
              </div>
              <Button size="lg" onClick={handleConfirm}>
                Thêm vào giỏ
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
