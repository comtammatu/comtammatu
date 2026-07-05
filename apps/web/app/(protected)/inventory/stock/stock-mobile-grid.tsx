"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { formatQty } from "../_lib/format";
import { formatStockUnits } from "../_lib/stock-unit-format";
import { CATEGORY_TONE_CLASS } from "../_lib/constants";
import type { StockIngredient } from "./stock-client";

const stockCopy = messages.inventory.stock;

const ALL_CATEGORY_VALUE = "all";
const NO_CATEGORY_VALUE = "__none__";

// Standalone bg-muted/50 pill chips (mirrors pos-menu-grid.tsx unified tabs):
// TabsTrigger defaults to flex-1, so !flex-none is required to keep chips at
// content width while the row scrolls horizontally.
const categoryTabClassName =
  "group/tab !flex-none gap-1.5 bg-muted/50 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground";

type StockGridItem = StockIngredient & { href: string };

function StockGridCard({ item }: { item: StockGridItem }) {
  // qty === 0 always computes status "out" (page.tsx computeStatus), which
  // floods the grid with destructive badges when stock_levels is empty
  // (pristine first-load, not a stock-out emergency). Only a real "low"
  // signal (qty > 0 but under min) keeps the destructive treatment.
  const showDestructive = item.status === "low";
  const categoryLabel = item.category || stockCopy.filters.noCategory;
  const { big, base } = formatStockUnits(item.qty, item.units, formatQty);

  return (
    <InteractiveCard
      asChild
      minHeight="mobile"
      padding="default"
      className="flex-col items-stretch gap-2"
    >
      <Link href={item.href}>
        <div className="flex items-start justify-between gap-2">
          <Badge
            className={
              item.category
                ? (CATEGORY_TONE_CLASS[item.category] ??
                  "bg-muted text-muted-foreground")
                : "bg-muted text-muted-foreground"
            }
          >
            {categoryLabel}
          </Badge>
          {showDestructive ? (
            <StatusBadge domain="inventory" value={item.status} size="sm" />
          ) : null}
        </div>

        <p className="line-clamp-2 flex-1 font-semibold leading-snug">
          {item.name}
        </p>

        <div className="flex flex-col leading-tight">
          <p
            className={cn(
              "font-mono text-xl font-bold tabular-nums",
              showDestructive ? "text-destructive" : "text-foreground",
              item.qty === 0 && !showDestructive && "text-muted-foreground",
            )}
          >
            {big ?? base}
          </p>
          {big !== null ? (
            <span className="text-sm font-normal text-muted-foreground">
              {base}
            </span>
          ) : null}
        </div>
      </Link>
    </InteractiveCard>
  );
}

export function StockMobileGrid({
  ingredients,
  stockDetailHref,
}: {
  ingredients: StockIngredient[];
  stockDetailHref: (ingredientId: number) => string;
}) {
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_VALUE);

  const categories = useMemo(() => {
    const values = [
      ...new Set(
        ingredients
          .map((ingredient) => ingredient.category)
          .filter((category) => category !== ""),
      ),
    ];
    values.sort((left, right) => left.localeCompare(right, "vi"));
    return values;
  }, [ingredients]);

  const hasUncategorized = useMemo(
    () => ingredients.some((ingredient) => ingredient.category === ""),
    [ingredients],
  );

  const items = useMemo(() => {
    const filtered =
      activeCategory === ALL_CATEGORY_VALUE
        ? ingredients
        : activeCategory === NO_CATEGORY_VALUE
          ? ingredients.filter((ingredient) => ingredient.category === "")
          : ingredients.filter(
              (ingredient) => ingredient.category === activeCategory,
            );

    return filtered.map((ingredient) => ({
      ...ingredient,
      href: stockDetailHref(ingredient.id),
    }));
  }, [ingredients, activeCategory, stockDetailHref]);

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="min-w-0 overflow-x-auto overflow-y-hidden"
      >
        <TabsList
          aria-label={stockCopy.filters.categoryPlaceholder}
          className="!h-auto w-max min-w-full !justify-start gap-1.5 !bg-transparent !p-0"
        >
          <TabsTrigger
            value={ALL_CATEGORY_VALUE}
            className={categoryTabClassName}
          >
            {stockCopy.filters.all}
          </TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger
              key={category}
              value={category}
              className={categoryTabClassName}
            >
              {category}
            </TabsTrigger>
          ))}
          {hasUncategorized ? (
            <TabsTrigger
              value={NO_CATEGORY_VALUE}
              className={categoryTabClassName}
            >
              {stockCopy.filters.noCategory}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <AppEmptyState
          compact
          title={stockCopy.empty.noData}
          description={stockCopy.empty.noDataDescription}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <StockGridCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
