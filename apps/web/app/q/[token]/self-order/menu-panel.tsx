"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Utensils as IconUtensils } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { AppEmptyState } from "@/components/surface";
import type {
  SelfOrderCartItem,
  SelfOrderMenuCategory,
  SelfOrderMenuItem,
} from "@lib/self-order/contracts";
import {
  ALL_MENU_VALUE,
  isSelfOrderComCategory,
  splitMenuItemDisplayName,
} from "./menu-display";
import { SelfOrderItemSheet } from "./item-sheet";

export {
  ALL_MENU_VALUE,
  defaultSelfOrderCategoryValue,
  isSelfOrderComCategory,
  splitMenuItemDisplayName,
} from "./menu-display";

export interface MenuPanelProps {
  categories: SelfOrderMenuCategory[];
  activeCategoryValue: string;
  onActiveCategoryChange: (value: string) => void;
  onAdd: (item: SelfOrderCartItem) => void;
  disabled?: boolean;
}

export function MenuPanel({
  categories,
  activeCategoryValue,
  onActiveCategoryChange,
  onAdd,
  disabled = false,
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
      <div className="border-b border-border bg-background px-3 py-2">
        <div className="flex items-center">{categoryPills}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-4 px-2 pb-44 pt-2 sm:pb-32">
          <div className="flex flex-col gap-1.5 px-1">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              {SELF_ORDER_VI.menuPromptTitle}
            </h2>
            <p className="text-base text-muted-foreground">
              {SELF_ORDER_VI.menuPromptDescription}
            </p>
          </div>
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
                    <div className="sticky top-0 z-10 -mx-2 flex min-w-0 items-center justify-between gap-3 bg-background/95 px-2 py-2 backdrop-blur">
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
                    categoryName={category.name}
                    onAdd={onAdd}
                    disabled={disabled}
                    compact={!isSelfOrderComCategory(category)}
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

export function MenuItemGrid({
  items,
  categoryName,
  onAdd,
  disabled = false,
  compact = false,
}: {
  items: SelfOrderMenuItem[];
  categoryName: string;
  onAdd: (item: SelfOrderCartItem) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <MenuItemCard
          key={item.id}
          item={item}
          categoryName={categoryName}
          onAdd={onAdd}
          disabled={disabled}
          compact={compact}
        />
      ))}
    </div>
  );
}

function MenuItemCard({
  item,
  categoryName,
  onAdd,
  disabled,
  compact,
}: {
  item: SelfOrderMenuItem;
  categoryName: string;
  onAdd: (item: SelfOrderCartItem) => void;
  disabled: boolean;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <>
      <MenuRowButton
        item={item}
        categoryName={categoryName}
        disabled={disabled}
        compact={compact}
        onClick={() => setOpen(true)}
      />
      <SelfOrderItemSheet
        item={item}
        open={open && !disabled}
        disabled={disabled}
        onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}
        onCommit={onAdd}
      />
    </>
  );
}

function MenuRowButton({
  item,
  categoryName,
  disabled,
  compact,
  onClick,
}: {
  item: SelfOrderMenuItem;
  categoryName: string;
  disabled: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const { title, tag } = splitMenuItemDisplayName(item.name);
  const priceLabel = formatVND(Number(item.base_price));

  return (
    <Button
      type="button"
      variant="outline"
      size="touch"
      disabled={disabled}
      aria-label={`${SELF_ORDER_VI.customizeItem}: ${item.name}, ${priceLabel}`}
      className="group h-auto w-full items-stretch justify-start gap-4 p-3 text-left whitespace-normal transition-[transform,background-color,border-color] duration-150 active:scale-[0.97]"
      onClick={onClick}
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
            className="object-cover transition-transform duration-150 group-active:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <IconUtensils
              className={
                compact
                  ? "size-6 text-muted-foreground"
                  : "size-8 text-muted-foreground"
              }
            />
          </span>
        )}
        {tag ? (
          <Badge
            variant="default"
            className="absolute top-1.5 left-1.5 z-10 truncate px-2 text-xs"
          >
            {tag}
          </Badge>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5 py-0.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {categoryName}
        </span>
        <span
          className={`line-clamp-2 font-heading font-semibold tracking-tight ${compact ? "text-lg leading-snug" : "text-2xl leading-tight"}`}
        >
          {title}
        </span>
        <span
          className={`font-mono font-semibold tabular-nums text-primary ${compact ? "text-lg" : "text-xl"}`}
        >
          {priceLabel}
        </span>
      </span>
    </Button>
  );
}
