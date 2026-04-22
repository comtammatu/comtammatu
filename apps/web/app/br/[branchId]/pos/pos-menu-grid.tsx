"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { formatVND } from "@comtammatu/shared/format";
import type { CategoryType } from "@comtammatu/shared";
import { CATEGORY_TYPE_LABELS } from "@comtammatu/shared/menu";
import { ChefHat, Plus, Search, ShoppingCart, X } from "lucide-react";
import { MENU_ZONE_ORDER } from "./pos-menu-types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { OrderType } from "./types";

interface PosMenuGridProps {
  categories: MenuCategory[];
  cartQuantity: number;
  cartTotal: number;
  orderType: OrderType;
  selectedTableNumber: number | undefined;
  onItemTap: (item: MenuItem) => void;
}

export function PosMenuGrid({
  categories,
  cartQuantity,
  cartTotal,
  orderType,
  selectedTableNumber,
  onItemTap,
}: PosMenuGridProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    categories[0]?.id ?? null,
  );
  const [activeMenuZone, setActiveMenuZone] = useState<CategoryType | null>(
    null,
  );

  const availableMenuZones = useMemo(
    () =>
      MENU_ZONE_ORDER.filter((zone) =>
        categories.some(
          (category) =>
            category.type === zone && category.menu_items.length > 0,
        ),
      ),
    [categories],
  );

  const effectiveMenuZone = useMemo(() => {
    if (activeMenuZone != null && availableMenuZones.includes(activeMenuZone)) {
      return activeMenuZone;
    }
    return availableMenuZones[0] ?? "main_dish";
  }, [activeMenuZone, availableMenuZones]);

  const categoriesInActiveZone = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.type === effectiveMenuZone &&
          category.menu_items.length > 0,
      ),
    [categories, effectiveMenuZone],
  );

  useEffect(() => {
    setActiveCategoryId((prev) => {
      const ok = categoriesInActiveZone.some((category) => category.id === prev);
      return ok ? prev : (categoriesInActiveZone[0]?.id ?? null);
    });
  }, [categoriesInActiveZone]);

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId),
    [categories, activeCategoryId],
  );

  const activeZoneLabel =
    CATEGORY_TYPE_LABELS[effectiveMenuZone] ?? effectiveMenuZone;
  const [query, setQuery] = useState("");
  const activeItems = activeCategory?.menu_items ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (normalizedQuery === "") return activeItems;

    return activeItems.filter((item) => {
      const haystack = `${item.name} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeItems, normalizedQuery]);
  const sparseMenu = visibleItems.length <= 2;
  const contextLabel =
    orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chọn bàn";
  const activeCategoryValue =
    activeCategoryId != null ? String(activeCategoryId) : undefined;

  if (availableMenuZones.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyMedia variant="icon">
          <ChefHat />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa có món trong thực đơn</EmptyTitle>
          <EmptyDescription>
            Thêm danh mục và món trong quản trị để phục vụ tại POS.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/60 bg-background px-3 py-3 md:px-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {activeZoneLabel}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {activeCategory?.name ?? "Chọn danh mục"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chạm món để đưa vào giỏ. Món cần tuỳ chọn sẽ mở chi tiết.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{contextLabel}</Badge>
                <Badge variant="outline">{cartQuantity} món trong giỏ</Badge>
                <Badge variant="outline">{formatVND(cartTotal)}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <InputGroup className="h-11 lg:max-w-md">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm món, topping, ghi chú món..."
                  aria-label="Tìm món"
                />
                {query.trim() !== "" && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Xóa tìm kiếm"
                      onClick={() => setQuery("")}
                    >
                      <X />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>

              <ScrollArea className="w-full lg:flex-1">
                <Tabs
                  value={effectiveMenuZone}
                  onValueChange={(value) =>
                    setActiveMenuZone(value as CategoryType)
                  }
                  className="gap-0"
                >
                  <TabsList
                    aria-label="Khu thực đơn"
                    className="h-auto justify-start gap-2 overflow-x-auto rounded-lg border bg-card p-2"
                  >
                    {availableMenuZones.map((zone) => (
                      <TabsTrigger
                        key={zone}
                        value={zone}
                        className="min-h-11 shrink-0 px-4 text-sm font-semibold"
                      >
                        {CATEGORY_TYPE_LABELS[zone] ?? zone}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </ScrollArea>
            </div>

            {categoriesInActiveZone.length > 1 ? (
              <ScrollArea className="w-full">
                <Tabs
                  value={activeCategoryValue}
                  onValueChange={(value) => setActiveCategoryId(Number(value))}
                  className="gap-0"
                >
                  <TabsList
                    aria-label="Danh mục món"
                    className="h-auto justify-start gap-2 overflow-x-auto rounded-lg border bg-background p-2"
                  >
                    {categoriesInActiveZone.map((category) => (
                      <TabsTrigger
                        key={category.id}
                        value={String(category.id)}
                        className="min-h-10 shrink-0 gap-2 px-3 text-sm font-medium"
                      >
                        {category.name}
                        <Badge variant="outline" className="text-xs">
                          {category.menu_items.length}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </ScrollArea>
            ) : null}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div
            className={cn(
              "grid gap-3 px-3 pb-24 pt-3 md:p-4",
              sparseMenu
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
            )}
          >
            {visibleItems.map((item) => {
              const hasCustomization =
                item.menu_item_variants.length > 0 ||
                item.menu_item_modifiers.length > 0 ||
                item.menu_item_available_sides.length > 0;

              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-auto min-h-44 w-full cursor-pointer flex-col items-stretch justify-between rounded-lg bg-card p-4 text-left whitespace-normal shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-95",
                    sparseMenu && "md:min-h-64 md:p-6",
                  )}
                  onClick={() => onItemTap(item)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-3">
                      <Badge variant="outline" className="w-fit text-xs">
                        {activeCategory?.name ?? activeZoneLabel}
                      </Badge>
                      <div>
                        <p
                          className={cn(
                            "line-clamp-2 text-lg font-semibold leading-snug text-foreground",
                            sparseMenu && "md:text-3xl",
                          )}
                        >
                          {item.name}
                        </p>
                        <p
                          className={cn(
                            "mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground",
                            sparseMenu && "md:max-w-2xl md:text-base",
                          )}
                        >
                          {item.description ??
                            "Chạm để thêm nhanh hoặc mở tuỳ chọn của món."}
                        </p>
                      </div>
                    </div>
                    <Badge variant={hasCustomization ? "warning" : "success"}>
                      {hasCustomization ? "Tuỳ chỉnh" : "Thêm nhanh"}
                    </Badge>
                  </div>

                  <div className="mt-auto flex flex-col gap-4 pt-6">
                    <div className="flex flex-wrap gap-2">
                      {item.menu_item_variants.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {item.menu_item_variants.length} lựa chọn
                        </Badge>
                      )}
                      {item.menu_item_modifiers.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {item.menu_item_modifiers.length} topping
                        </Badge>
                      )}
                      {item.menu_item_available_sides.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {item.menu_item_available_sides.length} món kèm
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Giá bán
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-2xl font-bold text-primary tabular-nums",
                            sparseMenu && "md:text-4xl",
                          )}
                        >
                          {formatVND(item.base_price)}
                        </p>
                      </div>
                      <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
                        <Plus className="size-4" />
                        Chọn món
                      </span>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>

          {visibleItems.length === 0 && (
            <Empty className="py-12">
              <EmptyMedia variant="icon">
                <ShoppingCart />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Không tìm thấy món phù hợp</EmptyTitle>
                <EmptyDescription>
                  Xóa tìm kiếm hoặc chọn danh mục khác để tiếp tục.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
