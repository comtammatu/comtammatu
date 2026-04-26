"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import Image from "next/image";
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
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { formatVND } from "@comtammatu/shared/format";
import { normalizeSearch } from "@lib/search";
import {
  ChefHat as IconChefHat,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
  X as IconX,
} from "lucide-react";
import type { MenuCategory, MenuItem } from "./pos-menu-types";

interface PosMenuGridProps {
  categories: MenuCategory[];
  onItemTap: (item: MenuItem) => void;
}

interface MenuItemButtonProps {
  item: MenuItem;
  sparseMenu: boolean;
  onItemTap: (item: MenuItem) => void;
}

interface MenuItemGridProps {
  items: MenuItem[];
  sparseMenu: boolean;
  onItemTap: (item: MenuItem) => void;
}

const ALL_MENU_VALUE = "all";

const MenuItemButton = memo(function MenuItemButton({
  item,
  sparseMenu,
  onItemTap,
}: MenuItemButtonProps) {
  const handleClick = useCallback(() => onItemTap(item), [item, onItemTap]);

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-auto min-h-56 min-w-0 w-full cursor-pointer flex-col items-stretch justify-between gap-2 p-2.5 text-left whitespace-normal shadow-sm transition-transform hover:border-primary/30 hover:shadow-md active:scale-95 md:min-h-64 md:gap-0 md:p-5 lg:min-h-72",
        sparseMenu && "md:min-h-64 md:p-6",
      )}
      onClick={handleClick}
    >
      <div className="flex h-full w-full flex-col justify-between gap-2 md:gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {item.image_url ? (
            <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-md bg-muted">
              <Image
                src={item.image_url}
                alt=""
                fill
                sizes="(min-width: 1536px) 16vw, (min-width: 1280px) 22vw, (min-width: 640px) 33vw, 50vw"
                className="object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>
          ) : (
            <div
              className="aspect-square w-full shrink-0 rounded-md bg-muted/40"
              aria-hidden
            />
          )}
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-foreground md:text-lg",
                sparseMenu && "md:text-3xl",
              )}
            >
              {item.name}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-1 md:gap-4 md:pt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-base font-bold text-primary tabular-nums sm:mt-1 md:text-2xl",
                sparseMenu && "md:text-4xl",
              )}
            >
              {formatVND(item.base_price)}
            </p>
          </div>
        </div>
      </div>
    </Button>
  );
});

const MenuItemGrid = memo(function MenuItemGrid({
  items,
  sparseMenu,
  onItemTap,
}: MenuItemGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 md:gap-3",
        sparseMenu
          ? "md:grid-cols-1"
          : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <MenuItemButton
          key={item.id}
          item={item}
          sparseMenu={sparseMenu}
          onItemTap={onItemTap}
        />
      ))}
    </div>
  );
});

function PosMenuGridComponent({ categories, onItemTap }: PosMenuGridProps) {
  const [, startMenuTransition] = useTransition();
  const [activeTabValue, setActiveTabValue] = useState<string>(ALL_MENU_VALUE);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.menu_items.length > 0),
    [categories],
  );

  useEffect(() => {
    setActiveTabValue((prev) => {
      if (prev === ALL_MENU_VALUE) return prev;

      const ok = availableCategories.some(
        (category) => String(category.id) === prev,
      );
      return ok ? prev : ALL_MENU_VALUE;
    });
  }, [availableCategories]);

  const activeCategory = useMemo(
    () =>
      availableCategories.find(
        (category) => String(category.id) === activeTabValue,
      ),
    [availableCategories, activeTabValue],
  );

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery).trim();
  const visibleCategories = useMemo(() => {
    if (normalizedQuery === "") return availableCategories;

    return availableCategories
      .map((category) => ({
        ...category,
        menu_items: category.menu_items.filter((item) => {
          const haystack = normalizeSearch(
            `${item.name} ${item.description ?? ""}`,
          );
          return haystack.includes(normalizedQuery);
        }),
      }))
      .filter((category) => category.menu_items.length > 0);
  }, [availableCategories, normalizedQuery]);
  const visibleItems = useMemo(() => {
    if (activeTabValue === ALL_MENU_VALUE) {
      return visibleCategories.flatMap((category) => category.menu_items);
    }

    return activeCategory == null
      ? []
      : (visibleCategories.find((category) => category.id === activeCategory.id)
          ?.menu_items ?? []);
  }, [activeCategory, activeTabValue, visibleCategories]);
  const allMenuItemCount = useMemo(
    () =>
      availableCategories.reduce(
        (sum, category) => sum + category.menu_items.length,
        0,
      ),
    [availableCategories],
  );
  const isAllMenuActive = activeTabValue === ALL_MENU_VALUE;
  const sparseMenu = !isAllMenuActive && visibleItems.length <= 2;
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    [],
  );
  const clearQuery = useCallback(() => setQuery(""), []);
  const handleCategoryChange = useCallback(
    (value: string) => {
      if (
        value !== ALL_MENU_VALUE &&
        !availableCategories.some((category) => String(category.id) === value)
      ) {
        return;
      }

      startMenuTransition(() => {
        setActiveTabValue((current) => (current === value ? current : value));
      });
    },
    [availableCategories, startMenuTransition],
  );

  if (availableCategories.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyMedia variant="icon">
          <IconChefHat />
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
        <div className="border-b border-border/60 bg-background px-2 py-1 md:px-5 md:py-4 lg:px-6">
          <div className="flex flex-col gap-1 md:gap-3">
            <div className="flex flex-col gap-1 md:gap-2 xl:flex-row xl:items-center">
              <InputGroup className="h-8 w-full md:h-11 md:max-w-md xl:w-64 xl:max-w-none xl:flex-none 2xl:w-72">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  id="pos-menu-search"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Tìm món, topping, ghi chú món..."
                  aria-label="Tìm món"
                />
                {query.trim() !== "" && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Xóa tìm kiếm"
                      onClick={clearQuery}
                    >
                      <IconX />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>

              <Tabs
                value={activeTabValue}
                onValueChange={handleCategoryChange}
                className="min-w-0 w-full gap-0 overflow-x-auto overflow-y-hidden xl:flex-1"
              >
                <TabsList
                  aria-label="Danh mục món"
                  className="h-8 w-max min-w-full justify-start gap-1 md:h-11 md:gap-2"
                >
                  <TabsTrigger
                    value={ALL_MENU_VALUE}
                    className="h-full shrink-0 gap-1 px-2 py-0 text-xs font-semibold md:gap-2 md:px-4 md:text-sm"
                  >
                    Tất cả
                    <Badge
                      variant="outline"
                      className="hidden text-sm sm:inline-flex"
                    >
                      {allMenuItemCount}
                    </Badge>
                  </TabsTrigger>
                  {availableCategories.map((category) => (
                    <TabsTrigger
                      key={category.id}
                      value={String(category.id)}
                      className="h-full shrink-0 gap-1 px-2 py-0 text-xs font-semibold md:gap-2 md:px-4 md:text-sm"
                    >
                      {category.name}
                      <Badge
                        variant="outline"
                        className="hidden text-sm sm:inline-flex"
                      >
                        {category.menu_items.length}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {visibleItems.length > 0 && isAllMenuActive ? (
            <div className="flex flex-col gap-5 px-2 pb-28 pt-2 md:gap-6 md:px-3 md:py-3 lg:px-4">
              {visibleCategories.map((category) => (
                <section
                  key={category.id}
                  className="flex min-w-0 flex-col gap-2 md:gap-3"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <h2 className="truncate text-sm font-semibold text-foreground md:text-base">
                      {category.name}
                    </h2>
                    <Badge variant="outline" className="shrink-0 text-sm">
                      {category.menu_items.length}
                    </Badge>
                  </div>
                  <MenuItemGrid
                    items={category.menu_items}
                    sparseMenu={false}
                    onItemTap={onItemTap}
                  />
                </section>
              ))}
            </div>
          ) : null}

          {visibleItems.length > 0 && !isAllMenuActive ? (
            <div className="px-2 pb-28 pt-2 md:px-3 md:py-3 lg:px-4">
              <MenuItemGrid
                items={visibleItems}
                sparseMenu={sparseMenu}
                onItemTap={onItemTap}
              />
            </div>
          ) : null}

          {visibleItems.length === 0 ? (
            <Empty className="py-12">
              <EmptyMedia variant="icon">
                <IconShoppingCart />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Không tìm thấy món phù hợp</EmptyTitle>
                <EmptyDescription>
                  Xóa tìm kiếm hoặc chọn danh mục khác để tiếp tục.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </ScrollArea>
      </div>
    </div>
  );
}

export const PosMenuGrid = memo(PosMenuGridComponent);
