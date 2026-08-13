"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Minus as IconMinus, Plus as IconPlus, X as IconX } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  RadioGroup,
  RadioGroupItem,
} from "@comtammatu/ui/components/radio-group";
import { Separator } from "@comtammatu/ui/components/separator";

import {
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@comtammatu/ui/components/field";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { BrandSymbol } from "@/components/brand";
import type {
  SelfOrderCartItem,
  SelfOrderMenuItem,
  SelfOrderMenuVariant,
} from "@lib/self-order/contracts";
import {
  menuItemAvailability,
  remainingAfterDemand,
} from "@lib/self-order/availability";
import {
  selfOrderItemImageBadges,
  splitMenuItemDisplayName,
} from "./menu-display";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/surface/app-sheet";

export interface SelfOrderItemSheetProps {
  item: SelfOrderMenuItem;
  open: boolean;
  disabled?: boolean;
  /** Cart demand already counted for this menu item (exclude the line being edited). */
  cartDemand?: number;
  /** When set, hydrate the sheet from an existing cart line and keep its key. */
  initialDraft?: SelfOrderCartItem | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (item: SelfOrderCartItem) => void;
}

function hydrateFromDraft(
  item: SelfOrderMenuItem,
  draft: SelfOrderCartItem | null | undefined,
): {
  variant: SelfOrderMenuVariant | null;
  modifierIds: Set<number>;
  sideQuantities: Map<number, number>;
  note: string;
  quantity: number;
} {
  if (!draft || draft.menu_item_id !== item.id) {
    return {
      variant: item.menu_item_variants[0] ?? null,
      modifierIds: new Set(),
      sideQuantities: new Map(
        item.menu_item_available_sides
          .filter((side) => side.is_default)
          .map((side) => [side.side_item.id, 1] as const),
      ),
      note: "",
      quantity: 1,
    };
  }

  const variant =
    draft.variant_id != null
      ? (item.menu_item_variants.find(
          (candidate) => candidate.id === draft.variant_id,
        ) ??
        item.menu_item_variants[0] ??
        null)
      : (item.menu_item_variants[0] ?? null);

  return {
    variant,
    modifierIds: new Set(
      draft.modifiers
        .map((modifier) => modifier.modifier_id)
        .filter((id) =>
          item.menu_item_modifiers.some((modifier) => modifier.id === id),
        ),
    ),
    sideQuantities: new Map(
      draft.sides
        .filter((side) =>
          item.menu_item_available_sides.some(
            (available) => available.side_item.id === side.side_item_id,
          ),
        )
        .map((side) => [side.side_item_id, side.quantity] as const),
    ),
    note: draft.note ?? "",
    quantity: draft.quantity,
  };
}

export function SelfOrderItemSheet({
  item,
  open,
  disabled = false,
  cartDemand = 0,
  initialDraft = null,
  onOpenChange,
  onCommit,
}: SelfOrderItemSheetProps) {
  const [selectedVariant, setSelectedVariant] =
    useState<SelfOrderMenuVariant | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedSideQuantities, setSelectedSideQuantities] = useState<
    Map<number, number>
  >(new Map());
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const wasOpenRef = useRef(false);
  const draftIdentityRef = useRef<string | null>(null);
  const availability = menuItemAvailability(item);
  const maxQuantity =
    remainingAfterDemand(
      availability,
      Math.max(0, cartDemand - (initialDraft?.quantity ?? 0)),
    ) ?? 99;
  const effectiveMaxQuantity = Math.max(1, Math.min(99, maxQuantity));

  useEffect(() => {
    const opening = open && !wasOpenRef.current;
    const identity = `${item.id}:${initialDraft?.key ?? "new"}`;
    const identityChanged = open && draftIdentityRef.current !== identity;
    wasOpenRef.current = open;
    if (!open) return;

    if (opening || identityChanged) {
      draftIdentityRef.current = identity;
      const hydrated = hydrateFromDraft(item, initialDraft);
      setSelectedVariant(hydrated.variant);
      setSelectedModifierIds(hydrated.modifierIds);
      setSelectedSideQuantities(hydrated.sideQuantities);
      setNote(hydrated.note);
      setQuantity(Math.min(hydrated.quantity, effectiveMaxQuantity));
      return;
    }

    setSelectedVariant((current) => {
      const next = current
        ? (item.menu_item_variants.find(
            (variant) => variant.id === current.id,
          ) ??
          item.menu_item_variants[0] ??
          null)
        : (item.menu_item_variants[0] ?? null);
      if (
        current?.id === next?.id &&
        current?.name === next?.name &&
        current?.price_adjustment === next?.price_adjustment
      ) {
        return current;
      }
      return next;
    });
    const availableModifierIds = new Set(
      item.menu_item_modifiers.map((modifier) => modifier.id),
    );
    setSelectedModifierIds((current) => {
      const next = new Set(
        [...current].filter((id) => availableModifierIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
    const availableSideIds = new Set(
      item.menu_item_available_sides.map((side) => side.side_item.id),
    );
    setSelectedSideQuantities((current) => {
      const next = new Map(
        [...current].filter(([id]) => availableSideIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
    setQuantity((current) => Math.min(current, effectiveMaxQuantity));
  }, [
    effectiveMaxQuantity,
    initialDraft,
    item,
    item.id,
    item.menu_item_available_sides,
    item.menu_item_modifiers,
    item.menu_item_variants,
    open,
  ]);

  const unitPrice =
    Number(item.base_price) + Number(selectedVariant?.price_adjustment ?? 0);
  const modifierTotal = useMemo(
    () =>
      item.menu_item_modifiers
        .filter((modifier) => selectedModifierIds.has(modifier.id))
        .reduce((sum, modifier) => sum + Number(modifier.price), 0),
    [item.menu_item_modifiers, selectedModifierIds],
  );
  const sideTotal = useMemo(
    () =>
      item.menu_item_available_sides
        .filter((side) => selectedSideQuantities.has(side.side_item.id))
        .reduce(
          (sum, side) =>
            sum +
            Number(side.side_item.base_price) *
              (selectedSideQuantities.get(side.side_item.id) ?? 1),
          0,
        ),
    [item.menu_item_available_sides, selectedSideQuantities],
  );
  const total = (unitPrice + modifierTotal + sideTotal) * quantity;
  const isEditing = initialDraft != null;
  const commitLabel = isEditing
    ? SELF_ORDER_VI.updateCartItem
    : SELF_ORDER_VI.addToCart;
  const { title, tag } = splitMenuItemDisplayName(item.name);
  const imageBadges = [...selfOrderItemImageBadges(item.name)];
  if (tag && !imageBadges.includes(tag)) {
    imageBadges.push(tag);
  }

  function toggleModifier(id: number) {
    setSelectedModifierIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSide(id: number) {
    setSelectedSideQuantities((current) => {
      const next = new Map(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, 1);
      }
      return next;
    });
  }

  function updateSideQuantity(id: number, delta: number) {
    setSelectedSideQuantities((current) => {
      const existing = current.get(id);
      if (existing == null) {
        if (delta <= 0) return current;
        return new Map(current).set(id, 1);
      }
      const nextQuantity = Math.min(20, Math.max(0, existing + delta));
      const next = new Map(current);
      if (nextQuantity === 0) {
        next.delete(id);
      } else {
        next.set(id, nextQuantity);
      }
      return next;
    });
  }

  function updateQuantity(delta: number) {
    setQuantity((current) =>
      Math.min(effectiveMaxQuantity, Math.max(1, current + delta)),
    );
  }

  function commitCustomizedItem() {
    if (disabled) return;
    const modifiers = item.menu_item_modifiers
      .filter((modifier) => selectedModifierIds.has(modifier.id))
      .map((modifier) => ({
        modifier_id: modifier.id,
        name: modifier.name,
        price: Number(modifier.price),
      }));
    const sides = item.menu_item_available_sides
      .filter((side) => selectedSideQuantities.has(side.side_item.id))
      .map((side) => ({
        side_item_id: side.side_item.id,
        name: side.side_item.name,
        price: Number(side.side_item.base_price),
        quantity: selectedSideQuantities.get(side.side_item.id) ?? 1,
        is_default: side.is_default,
      }));
    const trimmedNote = note.trim();
    onCommit({
      key:
        initialDraft?.key ??
        `${item.id}:${selectedVariant?.id ?? "base"}:${crypto.randomUUID()}`,
      menu_item_id: item.id,
      item_name: item.name,
      variant_id: selectedVariant?.id,
      variant_name: selectedVariant?.name,
      quantity,
      unit_price: unitPrice,
      modifiers,
      sides,
      note: trimmedNote === "" ? undefined : trimmedNote,
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        fullscreen
        className="mx-auto w-full max-w-2xl overflow-hidden p-0"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative h-80 w-full shrink-0 overflow-hidden bg-muted/50 sm:aspect-video sm:h-auto sm:max-h-64 md:max-h-48 lg:max-h-56">
            {item.image_url ? (
              <Image
                src={item.image_url}
                alt=""
                fill
                sizes="(min-width: 1024px) 42rem, (min-width: 640px) 36rem, 100vw"
                className="object-cover object-center"
                priority
              />
            ) : (
              <span className="flex size-full items-center justify-center">
                <BrandSymbol
                  variant="riceBowl"
                  size="xl"
                  decorative
                  className="opacity-50"
                />
              </span>
            )}
            {imageBadges.length > 0 ? (
              <span className="absolute top-3 right-16 left-3 z-10 flex flex-col items-start gap-1">
                {imageBadges.map((badge) => (
                  <Badge
                    key={badge}
                    variant="default"
                    className="max-w-full truncate px-2 text-xs"
                  >
                    {badge}
                  </Badge>
                ))}
              </span>
            ) : null}
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-touch"
                  className="absolute top-2 right-2 z-10"
                  aria-label={SELF_ORDER_VI.closeCustomizerAria}
                >
                  <IconX />
                </Button>
              }
            />
          </div>

          <div className="flex shrink-0 items-center border-b border-border/60 px-4 py-3">
            <SheetTitle className="min-w-0 flex-1 text-left font-heading text-2xl font-semibold tracking-tight">
              {title}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {SELF_ORDER_VI.customizeDescription}
            </SheetDescription>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 px-4 py-4">
              {item.menu_item_variants.length > 0 ? (
                <FieldSet className="gap-2">
                  <FieldLegend>{SELF_ORDER_VI.variantLabel}</FieldLegend>
                  <RadioGroup
                    value={selectedVariant ? String(selectedVariant.id) : ""}
                    onValueChange={(value) => {
                      const nextVariant =
                        item.menu_item_variants.find(
                          (variant) => String(variant.id) === value,
                        ) ?? null;
                      setSelectedVariant(nextVariant);
                    }}
                    className="gap-2"
                  >
                    {item.menu_item_variants.map((variant) => (
                      <Item
                        key={variant.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        render={
                          <FieldLabel
                            htmlFor={`self-order-variant-${item.id}-${variant.id}`}
                            className="w-full items-center gap-3 font-normal"
                          />
                        }
                      >
                        <RadioGroupItem
                          id={`self-order-variant-${item.id}-${variant.id}`}
                          value={String(variant.id)}
                          size="touch"
                        />
                        <ItemContent>
                          <ItemTitle className="text-base">
                            {variant.name}
                          </ItemTitle>
                        </ItemContent>
                        <ItemActions className="shrink-0 text-base text-muted-foreground">
                          {formatVND(
                            Number(item.base_price) +
                              Number(variant.price_adjustment),
                          )}
                        </ItemActions>
                      </Item>
                    ))}
                  </RadioGroup>
                </FieldSet>
              ) : null}

              {item.menu_item_modifiers.length > 0 ? (
                <FieldSet className="gap-2">
                  <FieldLegend>{SELF_ORDER_VI.modifierLabel}</FieldLegend>
                  <ItemGroup className="gap-2">
                    {item.menu_item_modifiers.map((modifier) => (
                      <Item
                        key={modifier.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        render={
                          <FieldLabel
                            htmlFor={`self-order-modifier-${item.id}-${modifier.id}`}
                            className="w-full items-center gap-3 font-normal"
                          />
                        }
                      >
                        <Checkbox
                          id={`self-order-modifier-${item.id}-${modifier.id}`}
                          size="touch"
                          checked={selectedModifierIds.has(modifier.id)}
                          onCheckedChange={() => toggleModifier(modifier.id)}
                        />
                        <ItemContent>
                          <ItemTitle className="text-base">
                            {modifier.name}
                          </ItemTitle>
                        </ItemContent>
                        <ItemActions className="shrink-0 text-base text-muted-foreground">
                          +{formatVND(Number(modifier.price))}
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                </FieldSet>
              ) : null}

              {item.menu_item_available_sides.length > 0 ? (
                <FieldSet className="gap-2">
                  <FieldLegend>{SELF_ORDER_VI.sidesLabel}</FieldLegend>
                  <ItemGroup className="gap-2">
                    {item.menu_item_available_sides.map((side) => {
                      const sideQuantity =
                        selectedSideQuantities.get(side.side_item.id) ?? 0;
                      const selected = sideQuantity > 0;
                      return (
                        <Item
                          key={side.id}
                          variant="outline"
                          className="flex-nowrap items-start gap-3"
                        >
                          <Checkbox
                            id={`self-order-side-${item.id}-${side.id}`}
                            className="mt-1.5"
                            size="touch"
                            checked={selected}
                            onCheckedChange={() =>
                              toggleSide(side.side_item.id)
                            }
                          />
                          <ItemContent>
                            <FieldLabel
                              htmlFor={`self-order-side-${item.id}-${side.id}`}
                              className="cursor-pointer text-base leading-snug font-normal"
                            >
                              {side.side_item.name}
                            </FieldLabel>
                            <ItemTitle className="text-sm font-normal text-muted-foreground">
                              +{formatVND(Number(side.side_item.base_price))}
                            </ItemTitle>
                          </ItemContent>
                          <ItemActions className="shrink-0 gap-1 self-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="touch"
                              className="min-w-12 px-0"
                              disabled={!selected}
                              aria-label={SELF_ORDER_VI.decreaseSideAria(
                                side.side_item.name,
                              )}
                              onClick={() =>
                                updateSideQuantity(side.side_item.id, -1)
                              }
                            >
                              <IconMinus />
                            </Button>
                            <span className="w-7 text-center text-base font-semibold tabular-nums">
                              {sideQuantity}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="touch"
                              className="min-w-12 px-0"
                              aria-label={SELF_ORDER_VI.increaseSideAria(
                                side.side_item.name,
                              )}
                              onClick={() =>
                                updateSideQuantity(side.side_item.id, 1)
                              }
                            >
                              <IconPlus />
                            </Button>
                          </ItemActions>
                        </Item>
                      );
                    })}
                  </ItemGroup>
                </FieldSet>
              ) : null}

              <FieldSet className="gap-2">
                <FieldLabel
                  htmlFor={`self-order-item-note-${item.id}`}
                  className="text-base font-semibold"
                >
                  {SELF_ORDER_VI.itemNoteLabel}
                </FieldLabel>
                <Textarea
                  id={`self-order-item-note-${item.id}`}
                  name={`itemNote-${item.id}`}
                  autoComplete="off"
                  value={note}
                  maxLength={300}
                  rows={2}
                  placeholder={SELF_ORDER_VI.itemNotePlaceholder}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FieldSet>
            </div>
          </ScrollArea>

          <Separator />
          <div className="workflow-safe-pb flex shrink-0 flex-wrap items-center gap-2 p-3 sm:flex-nowrap">
            <p
              className="min-w-0 shrink-0 font-mono text-lg font-semibold tabular-nums text-primary"
              aria-label={`${SELF_ORDER_VI.subtotal}: ${formatVND(total)}`}
            >
              {formatVND(total)}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                disabled={quantity <= 1}
                aria-label={SELF_ORDER_VI.decreaseQuantityAria}
                onClick={() => updateQuantity(-1)}
              >
                <IconMinus />
              </Button>
              <span className="w-7 text-center text-base font-semibold tabular-nums">
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                disabled={quantity >= effectiveMaxQuantity}
                aria-label={SELF_ORDER_VI.increaseQuantityAria}
                onClick={() => updateQuantity(1)}
              >
                <IconPlus />
              </Button>
            </div>
            <Button
              type="button"
              size="touch"
              className="min-w-0 flex-1 max-sm:basis-full"
              disabled={disabled}
              onClick={commitCustomizedItem}
            >
              {commitLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
