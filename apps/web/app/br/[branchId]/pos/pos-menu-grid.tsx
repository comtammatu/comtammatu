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
import { AppEmptyState } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { messages } from "@lib/messages";
import {
  ChefHat as IconChefHat,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
  Utensils as IconUtensils,
  X as IconX,
} from "lucide-react";
import {
  isItemBlockedByDailyLimit,
  remainingDailyQuota,
  type MenuCategory,
  type MenuItem,
  type MenuItemDailyLimit,
} from "./pos-menu-types";
import { useDailyLimit } from "./_providers/pos-desktop-provider";

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
  // Per-item subscription qua external store — chỉ card này re-render
  // khi sold_today/is_disabled/limit_quantity của ID này đổi (Fix#4 B1).
  const dailyLimit: MenuItemDailyLimit | null = useDailyLimit(item.id);
  const blocked = isItemBlockedByDailyLimit(dailyLimit);
  const remaining = remainingDailyQuota(dailyLimit);
  const handleClick = useCallback(() => {
    if (blocked) return;
    onItemTap(item);
  }, [blocked, item, onItemTap]);

  const limitBadgeLabel = dailyLimit?.is_disabled
    ? messages.pos.menu.disabled
    : blocked
      ? messages.pos.menu.soldOut
      : remaining !== null && remaining <= 5
        ? messages.pos.menu.remaining(remaining)
        : null;
  const limitBadgeVariant: "destructive" | "warning" | undefined =
    dailyLimit?.is_disabled || blocked
      ? "destructive"
      : remaining !== null && remaining <= 5
        ? "warning"
        : undefined;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={blocked}
      aria-disabled={blocked}
      aria-label={`${item.name}, ${formatVND(item.base_price)}`}
      className={cn(
        "group relative aspect-square h-auto min-w-0 w-full overflow-hidden p-0 text-left shadow-sm transition-transform hover:shadow-md active:scale-[0.97]",
        sparseMenu && "md:aspect-[3/2]",
        blocked && "opacity-60 grayscale hover:shadow-sm",
      )}
      onClick={handleClick}
    >
      {/* Ảnh phủ kín thẻ — `object-cover` cắt vừa khung, ảnh món luôn được
          điền hết khung không có viền trắng. Khi không có ảnh, fallback bằng
          icon Utensils tone muted. */}
      <span className="absolute inset-0 block">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            sizes="(min-width: 1536px) 14vw, (min-width: 1280px) 18vw, (min-width: 640px) 24vw, 33vw"
            className="object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted/60">
            <IconUtensils className="size-8 text-muted-foreground/30" />
          </span>
        )}
      </span>

      {/* Gradient đen từ dưới lên — giúp tên món nền trắng đọc rõ trên ảnh sáng. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

      {/* Giá — góc trên phải, badge primary nổi với shadow. */}
      <span
        className={cn(
          "absolute right-1.5 top-1.5 z-10 inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground shadow-md md:right-2 md:top-2 md:px-2 md:py-1 md:text-sm",
          sparseMenu && "md:text-base",
        )}
      >
        {formatVND(item.base_price)}
      </span>

      {/* Daily-limit badge — góc trên trái, không che giá. */}
      {limitBadgeLabel ? (
        <Badge
          variant={limitBadgeVariant}
          className="absolute left-1.5 top-1.5 z-10 text-xs shadow-md md:left-2 md:top-2"
        >
          {limitBadgeLabel}
        </Badge>
      ) : null}

      {/* Tên món — overlay đáy ảnh, text trắng + drop-shadow chống lệch nền. */}
      <span
        className={cn(
          "pos-text-overlay absolute inset-x-2 bottom-2 z-10 line-clamp-2 text-sm font-semibold leading-snug text-white md:inset-x-3 md:bottom-3 md:text-base",
          sparseMenu && "md:text-xl",
        )}
      >
        {item.name}
      </span>
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
        "grid grid-cols-3 gap-2",
        sparseMenu
          ? "md:grid-cols-1"
          : "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
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
  // Mobile: search input ẩn mặc định, hiện khi user tap icon 🔍.
  // Khi active, input thay chỗ tabs row (cùng 1 dòng) + nút "Hủy" để collapse.
  // Desktop (md+) luôn hiện cả 2 cùng dòng nên flag này không ảnh hưởng.
  const [isSearchActive, setIsSearchActive] = useState(false);

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
  const openSearch = useCallback(() => setIsSearchActive(true), []);
  const cancelSearch = useCallback(() => {
    setIsSearchActive(false);
    setQuery("");
  }, []);
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
      <AppEmptyState
        title={messages.pos.menu.empty}
        icon={<IconChefHat />}
        className="flex-1"
      />
    );
  }

  const searchInput = (
    <InputGroup className="w-full md:max-w-md xl:w-64 xl:max-w-none xl:flex-none 2xl:w-72">
      <InputGroupInput
        id="pos-menu-search"
        value={query}
        onChange={handleQueryChange}
        autoFocus={isSearchActive}
        placeholder={messages.pos.menu.searchPlaceholder}
        aria-label={messages.pos.menu.searchAria}
      />
      <InputGroupAddon>
        <IconSearch />
      </InputGroupAddon>
      {query.trim() !== "" && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={messages.pos.menu.clearSearchAria}
            onClick={clearQuery}
          >
            <IconX />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );

  const tabBadgeClassName =
    "hidden shrink-0 text-xs sm:inline-flex group-data-[state=active]/tab:border-primary-foreground/30 group-data-[state=active]/tab:bg-primary-foreground/15 group-data-[state=active]/tab:text-primary-foreground";
  const unifiedTabs = (
    <Tabs
      value={activeTabValue}
      onValueChange={handleCategoryChange}
      className="min-w-0 flex-1 gap-0 overflow-x-auto overflow-y-hidden xl:flex-1"
    >
      <TabsList
        variant="pills"
        size="touch"
        aria-label={messages.pos.menu.categoriesAria}
        className="w-max min-w-full"
      >
        <TabsTrigger value={ALL_MENU_VALUE}>
          {messages.pos.menu.all}
          <Badge variant="outline" className={tabBadgeClassName}>
            {allMenuItemCount}
          </Badge>
        </TabsTrigger>
        {availableCategories.map((category) => (
          <TabsTrigger
            key={category.id}
            value={String(category.id)}
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
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/60 bg-background px-2 py-2 md:px-5 md:py-4 lg:px-6">
          {/* Mobile: 1 row — search button + category pills.
              tab pills cùng style. Tap search → input + nút Hủy thay chỗ tabs. */}
          <div className="flex items-center gap-1.5 md:hidden">
            {isSearchActive ? (
              <>
                <div className="min-w-0 flex-1">{searchInput}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="shrink-0 text-sm font-semibold"
                  onClick={cancelSearch}
                >
                  {messages.pos.menu.cancel}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="shrink-0 bg-muted/50 text-muted-foreground hover:bg-muted"
                  aria-label={messages.pos.menu.searchAria}
                  onClick={openSearch}
                >
                  <IconSearch />
                </Button>
                {unifiedTabs}
              </>
            )}
          </div>

          {/* Desktop (md+): search + tabs cùng dòng. */}
          <div className="hidden md:flex md:items-center md:gap-3">
            {searchInput}
            {unifiedTabs}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {visibleItems.length > 0 && isAllMenuActive ? (
            <div className="flex flex-col gap-3 px-2 pb-28 pt-2 md:gap-4 md:px-3 md:py-3 lg:px-4">
              {visibleCategories.map((category) => (
                <section
                  key={category.id}
                  className="flex min-w-0 flex-col gap-2 md:gap-3"
                >
                  <div className="sticky top-0 z-10 -mx-2 flex min-w-0 items-center justify-between gap-3 bg-background/95 px-2 py-1.5 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
                    <h2 className="font-heading truncate text-base font-semibold text-foreground">
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
            <AppEmptyState
              title={messages.pos.menu.noResults}
              icon={<IconShoppingCart />}
              className="m-2"
              compact
            />
          ) : null}
        </ScrollArea>
      </div>
    </div>
  );
}

export const PosMenuGrid = memo(PosMenuGridComponent);
