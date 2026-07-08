"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Minus as IconMinus,
  Plus as IconPlus,
  Utensils as IconUtensils,
  X as IconX,
} from "lucide-react";
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@comtammatu/ui/components/field";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { AppEmptyState } from "@/components/surface";
import type {
  SelfOrderCartItem,
  SelfOrderMenuCategory,
  SelfOrderMenuItem,
  SelfOrderMenuVariant,
} from "@lib/self-order/contracts";

const ALL_MENU_VALUE = "all";

export interface MenuPanelProps {
  categories: SelfOrderMenuCategory[];
  activeCategoryValue: string;
  onActiveCategoryChange: (value: string) => void;
  onAdd: (item: SelfOrderCartItem) => void;
}

export function MenuPanel({
  categories,
  activeCategoryValue,
  onActiveCategoryChange,
  onAdd,
}: MenuPanelProps) {
  const availableCategories = categories.filter(
    (category) => category.menu_items.length > 0,
  );
  const allMenuItemCount = availableCategories.reduce(
    (sum, category) => sum + category.menu_items.length,
    0,
  );
  const visibleItems =
    activeCategoryValue === ALL_MENU_VALUE
      ? availableCategories.flatMap((category) => category.menu_items)
      : (availableCategories.find(
          (category) => String(category.id) === activeCategoryValue,
        )?.menu_items ?? []);
  const isAllMenuActive = activeCategoryValue === ALL_MENU_VALUE;

  const tabPillClassName =
    "group/tab !flex-none gap-1.5 bg-muted/50 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground";
  const tabBadgeClassName =
    "hidden shrink-0 text-xs group-data-[state=active]/tab:border-primary-foreground/30 group-data-[state=active]/tab:bg-primary-foreground/15 group-data-[state=active]/tab:text-primary-foreground";
  const unifiedTabs = (
    <Tabs
      value={activeCategoryValue}
      onValueChange={onActiveCategoryChange}
      className="no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
    >
      <TabsList
        aria-label={SELF_ORDER_VI.categoriesAria}
        className="!h-auto w-max min-w-full !justify-start gap-1.5 !bg-transparent !p-0"
      >
        <TabsTrigger value={ALL_MENU_VALUE} className={tabPillClassName}>
          {SELF_ORDER_VI.allCategories}
          <Badge variant="outline" className={tabBadgeClassName}>
            {allMenuItemCount}
          </Badge>
        </TabsTrigger>
        {availableCategories.map((category) => (
          <TabsTrigger
            key={category.id}
            value={String(category.id)}
            className={tabPillClassName}
          >
            {category.name}
            <Badge variant="outline" className={tabBadgeClassName}>
              {category.menu_items.length}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-background px-3 py-2">
        <div className="flex items-center">{unifiedTabs}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-4 px-2 pb-32 pt-2">
          {availableCategories.length === 0 ? (
            <AppEmptyState
              title={SELF_ORDER_VI.menuEmpty}
              icon={<IconUtensils />}
              compact
            />
          ) : visibleItems.length === 0 ? (
            <AppEmptyState
              title={SELF_ORDER_VI.menuEmpty}
              icon={<IconUtensils />}
              compact
            />
          ) : isAllMenuActive ? (
            availableCategories.map((category) => (
              <section
                key={category.id}
                className="flex min-w-0 flex-col gap-3"
              >
                <div className="sticky top-0 z-10 -mx-2 flex min-w-0 items-center justify-between gap-3 bg-background/95 px-2 py-2 backdrop-blur">
                  <h2 className="font-heading truncate text-base font-semibold">
                    {category.name}
                  </h2>
                  <Badge variant="outline" className="shrink-0 text-sm">
                    {category.menu_items.length}
                  </Badge>
                </div>
                <MenuItemGrid items={category.menu_items} onAdd={onAdd} />
              </section>
            ))
          ) : (
            <MenuItemGrid items={visibleItems} onAdd={onAdd} />
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

export function MenuItemGrid({
  items,
  onAdd,
}: {
  items: SelfOrderMenuItem[];
  onAdd: (item: SelfOrderCartItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <MenuItemCard key={item.id} item={item} onAdd={onAdd} />
      ))}
    </div>
  );
}

function MenuItemCard({
  item,
  onAdd,
}: {
  item: SelfOrderMenuItem;
  onAdd: (item: SelfOrderCartItem) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <MenuPhotoButton item={item} onClick={() => setOpen(true)} />
      <SelfOrderItemSheet
        item={item}
        open={open}
        onOpenChange={setOpen}
        onAdd={onAdd}
      />
    </>
  );
}

function SelfOrderItemSheet({
  item,
  open,
  onOpenChange,
  onAdd,
}: {
  item: SelfOrderMenuItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: SelfOrderCartItem) => void;
}) {
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

  useEffect(() => {
    if (!open) return;
    setSelectedVariant(item.menu_item_variants[0] ?? null);
    setSelectedModifierIds(new Set());
    setSelectedSideQuantities(
      new Map(
        item.menu_item_available_sides
          .filter((side) => side.is_default)
          .map((side) => [side.side_item.id, 1] as const),
      ),
    );
    setNote("");
    setQuantity(1);
  }, [item, open]);

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
    setQuantity((current) => Math.min(99, Math.max(1, current + delta)));
  }

  function addCustomizedItem() {
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
    onAdd({
      key: `${item.id}:${selectedVariant?.id ?? "base"}:${crypto.randomUUID()}`,
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
        className="h-dvh max-h-dvh p-0"
      >
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
                  aria-label={SELF_ORDER_VI.closeCustomizerAria}
                >
                  <IconX />
                </Button>
              </SheetClose>
            </div>
            <SheetDescription className="text-left">
              {item.description ?? SELF_ORDER_VI.customizeDescription}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 px-4 pb-4">
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
                        asChild
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                      >
                        <FieldLabel
                          htmlFor={`self-order-variant-${item.id}-${variant.id}`}
                          className="w-full items-center gap-3 font-normal"
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
                        </FieldLabel>
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
                        asChild
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                      >
                        <FieldLabel
                          htmlFor={`self-order-modifier-${item.id}-${modifier.id}`}
                          className="w-full items-center gap-3 font-normal"
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
                        </FieldLabel>
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
          <div className="flex shrink-0 items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                {SELF_ORDER_VI.subtotal}
              </p>
              <p className="text-xl font-bold tabular-nums text-primary">
                {formatVND(total)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="min-w-12 px-0"
                disabled={quantity <= 1}
                aria-label={SELF_ORDER_VI.decreaseQuantityAria}
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
                size="touch"
                className="min-w-12 px-0"
                aria-label={SELF_ORDER_VI.increaseQuantityAria}
                onClick={() => updateQuantity(1)}
              >
                <IconPlus />
              </Button>
            </div>
            <Button
              type="button"
              size="touch"
              className="min-w-20"
              onClick={addCustomizedItem}
            >
              {SELF_ORDER_VI.addToCart}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuPhotoButton({
  item,
  onClick,
}: {
  item: SelfOrderMenuItem;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={`${SELF_ORDER_VI.customizeItem}: ${item.name}, ${formatVND(Number(item.base_price))}`}
      className="group relative aspect-[4/5] h-auto min-w-0 w-full overflow-hidden p-0 text-left"
      onClick={onClick}
    >
      <span className="absolute inset-0 block">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 640px) 50vw, 50vw"
            className="object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted/50">
            <IconUtensils className="size-6 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
      <Badge className="absolute right-2 top-2 z-10 h-auto rounded-md px-2 py-1 text-sm font-bold tabular-nums">
        {formatVND(Number(item.base_price))}
      </Badge>
      <span className="pos-text-overlay absolute inset-x-3 bottom-3 z-10 line-clamp-2 text-base font-bold leading-snug text-white">
        {item.name}
      </span>
    </Button>
  );
}
