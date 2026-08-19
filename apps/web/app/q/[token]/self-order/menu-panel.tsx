"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Star as IconStar,
  ThumbsUp as IconThumbsUp,
  Plus as IconPlus,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { BrandSymbol } from "@/components/brand";
import type {
  SelfOrderCartItem,
  SelfOrderMenuCategory,
  SelfOrderMenuItem,
} from "@lib/self-order/contracts";
import {
  availabilityReasonLabel,
  isAvailabilityBlocked,
  menuItemAvailability,
  remainingLabel,
} from "@lib/self-order/availability";
import {
  ALL_MENU_VALUE,
  isSelfOrderComCategory,
  isSelfOrderItemSimple,
  selfOrderItemImageBadges,
  splitMenuItemDisplayName,
} from "./menu-display";
import { SelfOrderItemSheet } from "./item-sheet";
import { QuantityStepper } from "./quantity-stepper";

export {
  ALL_MENU_VALUE,
  defaultSelfOrderCategoryValue,
  isSelfOrderComCategory,
  isSelfOrderItemSimple,
  selfOrderItemImageBadges,
  splitMenuItemDisplayName,
} from "./menu-display";

export interface MenuPanelProps {
  categories: SelfOrderMenuCategory[];
  activeCategoryValue: string;
  onActiveCategoryChange: (value: string) => void;
  onAdd: (item: SelfOrderCartItem) => void;
  onDecrease: (menuItemId: number) => void;
  disabled?: boolean;
  cartDemandByMenuItemId?: ReadonlyMap<number, number>;
}

export function MenuPanel({
  categories,
  activeCategoryValue,
  onActiveCategoryChange,
  onAdd,
  onDecrease,
  disabled = false,
  cartDemandByMenuItemId,
}: MenuPanelProps) {
  const availableCategories = categories.filter(
    (category) => category.menu_items.length > 0,
  );
  const allMenuItemCount = availableCategories.reduce(
    (sum, category) => sum + category.menu_items.length,
    0,
  );
  const activeCategory = availableCategories.find(
    (category) => String(category.id) === activeCategoryValue,
  );
  const isAllMenuActive = activeCategoryValue === ALL_MENU_VALUE;
  const visibleCategoryRows = isAllMenuActive
    ? availableCategories.map((category) => ({
        category,
        items: category.menu_items,
      }))
    : activeCategory
      ? [{ category: activeCategory, items: activeCategory.menu_items }]
      : [];
  const hasVisibleItems = visibleCategoryRows.some(
    (row) => row.items.length > 0,
  );

  const categoryPills = (
    <div
      aria-label={SELF_ORDER_VI.categoriesAria}
      className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
    >
      {availableCategories.map((category) => {
        const value = String(category.id);
        return (
          <Button
            key={category.id}
            type="button"
            size="touch"
            variant={activeCategoryValue === value ? "default" : "outline"}
            className="shrink-0 rounded-full px-3"
            onClick={() => onActiveCategoryChange(value)}
          >
            {category.name}
          </Button>
        );
      })}
      <Button
        type="button"
        size="touch"
        variant={isAllMenuActive ? "default" : "outline"}
        className="shrink-0 rounded-full px-3"
        onClick={() => onActiveCategoryChange(ALL_MENU_VALUE)}
      >
        {SELF_ORDER_VI.allCategories}
        <Badge variant="outline">{allMenuItemCount}</Badge>
      </Button>
    </div>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center">{categoryPills}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden overscroll-contain">
        <div className="flex flex-col gap-4 px-2 pt-2 pb-2">
          {availableCategories.length === 0 || !hasVisibleItems ? (
            <AppEmptyState
              title={SELF_ORDER_VI.menuEmpty}
              symbol="riceBowl"
              compact
            />
          ) : (
            visibleCategoryRows.map(({ category, items }) => {
              if (items.length === 0) return null;
              return (
                <section
                  key={category.id}
                  className="flex min-w-0 flex-col gap-3"
                >
                  {isAllMenuActive ? (
                    <div className="sticky top-0 z-10 -mx-2 flex min-w-0 items-center justify-between gap-3 border-b border-border bg-background px-2 py-2">
                      <h2 className="font-heading truncate text-base font-semibold">
                        {category.name}
                      </h2>
                      <Badge variant="outline" className="shrink-0 text-sm">
                        {items.length}
                      </Badge>
                    </div>
                  ) : null}
                  <MenuItemGrid
                    items={items}
                    onAdd={onAdd}
                    onDecrease={onDecrease}
                    disabled={disabled}
                    compact={!isSelfOrderComCategory(category)}
                    prioritizeLeadingImages={
                      !isAllMenuActive && isSelfOrderComCategory(category)
                    }
                    cartDemandByMenuItemId={cartDemandByMenuItemId}
                  />
                </section>
              );
            })
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function createDefaultCartItem(item: SelfOrderMenuItem): SelfOrderCartItem {
  const defaultVariant = item.menu_item_variants[0] ?? null;
  const defaultSides = item.menu_item_available_sides
    .filter((side) => side.is_default)
    .map((side) => ({
      side_item_id: side.side_item.id,
      name: side.side_item.name,
      price: Number(side.side_item.base_price),
      quantity: 1,
      is_default: true,
    }));
  const basePrice = defaultVariant
    ? Number(item.base_price) + Number(defaultVariant.price_adjustment)
    : Number(item.base_price);
  const sidesPrice = defaultSides.reduce(
    (sum, side) => sum + side.price * side.quantity,
    0,
  );

  return {
    key: crypto.randomUUID(),
    menu_item_id: item.id,
    item_name: item.name,
    variant_id: defaultVariant?.id ?? null,
    variant_name: defaultVariant?.name ?? null,
    unit_price: basePrice + sidesPrice,
    quantity: 1,
    note: "",
    modifiers: [],
    sides: defaultSides,
  };
}

function MenuItemGrid({
  items,
  onAdd,
  onDecrease,
  disabled = false,
  compact = false,
  prioritizeLeadingImages = false,
  cartDemandByMenuItemId,
}: {
  items: SelfOrderMenuItem[];
  onAdd: (item: SelfOrderCartItem) => void;
  onDecrease: (menuItemId: number) => void;
  disabled?: boolean;
  compact?: boolean;
  prioritizeLeadingImages?: boolean;
  cartDemandByMenuItemId?: ReadonlyMap<number, number>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((item, index) => (
        <MenuItemCard
          key={item.id}
          item={item}
          onAdd={onAdd}
          onDecrease={onDecrease}
          disabled={disabled}
          compact={compact}
          priority={prioritizeLeadingImages && index < 2}
          cartDemand={cartDemandByMenuItemId?.get(item.id) ?? 0}
        />
      ))}
    </div>
  );
}

function MenuItemCard({
  item,
  onAdd,
  onDecrease,
  disabled,
  compact,
  cartDemand,
  priority = false,
}: {
  item: SelfOrderMenuItem;
  onAdd: (item: SelfOrderCartItem) => void;
  onDecrease: (menuItemId: number) => void;
  disabled: boolean;
  compact: boolean;
  cartDemand: number;
  priority?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const availability = menuItemAvailability(item);
  const soldOut = isAvailabilityBlocked(availability, cartDemand);
  const blocked = disabled || soldOut;
  const isSimple = isSelfOrderItemSimple(item);

  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);

  const addOrCustomize = () => {
    if (blocked) return;
    if (isSimple) {
      onAdd(createDefaultCartItem(item));
      toast.success(item.name);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <MenuRowButton
        item={item}
        disabled={blocked}
        compact={compact}
        cartDemand={cartDemand}
        isSimple={isSimple}
        priority={priority}
        onDecrease={() => onDecrease(item.id)}
        onQuickAdd={addOrCustomize}
        onClick={addOrCustomize}
      />
      {isSimple ? null : (
        <SelfOrderItemSheet
          item={item}
          open={open && !blocked}
          disabled={blocked}
          cartDemand={cartDemand}
          onOpenChange={(nextOpen) => setOpen(blocked ? false : nextOpen)}
          onCommit={onAdd}
        />
      )}
    </>
  );
}

function MenuRowButton({
  item,
  disabled,
  compact,
  cartDemand,
  isSimple,
  priority = false,
  onDecrease,
  onQuickAdd,
  onClick,
}: {
  item: SelfOrderMenuItem;
  disabled: boolean;
  compact: boolean;
  cartDemand: number;
  isSimple: boolean;
  priority?: boolean;
  onDecrease: () => void;
  onQuickAdd: () => void;
  onClick: () => void;
}) {
  const { title, tag } = splitMenuItemDisplayName(item.name);
  const priceLabel = formatVND(Number(item.base_price));
  const availability = menuItemAvailability(item);
  const reason = availabilityReasonLabel(availability, cartDemand);
  const remaining = remainingLabel(availability, cartDemand);
  const curatedBadges = selfOrderItemImageBadges(item.name);
  const imageIcon = curatedBadges.includes("Truyền thống") ? (
    <IconStar />
  ) : curatedBadges.includes("Chờ 20 phút") ? (
    <IconThumbsUp />
  ) : null;
  const imageBadges = [...curatedBadges];
  if (tag && !imageBadges.includes(tag)) {
    imageBadges.push(tag);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${isSimple ? SELF_ORDER_VI.addToCart : SELF_ORDER_VI.customizeItem}: ${item.name}, ${priceLabel}`}
      className={`relative isolate flex h-auto w-full cursor-pointer items-stretch justify-start gap-4 p-3 text-left whitespace-normal rounded-lg border border-border bg-card [contain:layout_paint] transition-transform duration-150 ease-[var(--ease-move)] active:scale-[0.97] disabled:opacity-60 ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span
        className={`relative shrink-0 overflow-hidden rounded-md bg-muted/50 ${compact ? "h-16 w-16" : "h-32 w-32"}`}
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            sizes={compact ? "64px" : "128px"}
            className="object-cover"
            decoding="async"
            {...(priority ? { priority: true } : { loading: "lazy" as const })}
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <BrandSymbol
              variant="riceBowl"
              size={compact ? "md" : "lg"}
              decorative
              className="opacity-50"
            />
          </span>
        )}
        {imageIcon ? (
          <Badge
            aria-hidden
            className="absolute left-2 top-2 z-10 size-8 justify-center p-0"
          >
            {imageIcon}
          </Badge>
        ) : null}
      </span>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="flex flex-col items-start gap-1">
          {remaining || reason || imageBadges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {remaining ? (
                <Badge variant="secondary">{remaining}</Badge>
              ) : null}
              {imageBadges.map((badge) => (
                <Badge key={badge} variant="default">
                  {badge}
                </Badge>
              ))}
              {reason ? <Badge variant="destructive">{reason}</Badge> : null}
            </div>
          ) : null}
          <span
            className={`line-clamp-2 font-heading font-semibold tracking-tight ${compact ? "text-lg leading-snug" : "text-2xl leading-tight"}`}
          >
            {title}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={`font-mono font-semibold tabular-nums text-primary ${compact ? "text-lg" : "text-xl"}`}
          >
            {priceLabel}
          </span>

          {cartDemand > 0 ? (
            <QuantityStepper
              quantity={cartDemand}
              disabled={disabled}
              decreaseLabel={`${SELF_ORDER_VI.decreaseQuantityAria}: ${item.name}`}
              increaseLabel={`${SELF_ORDER_VI.increaseQuantityAria}: ${item.name}`}
              onDecrease={onDecrease}
              onIncrease={onQuickAdd}
            />
          ) : (
            <Button
              type="button"
              size="icon-touch"
              className="size-8 shadow-xs"
              disabled={disabled}
              aria-label={`${SELF_ORDER_VI.addToCart}: ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd();
              }}
            >
              <IconPlus className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
