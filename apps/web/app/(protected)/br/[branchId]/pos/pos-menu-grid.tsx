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
import { type MenuCategory, type MenuItem } from "./pos-menu-types";
import { useDailyLimit } from "./_providers/pos-desktop-provider";
import { remainingDailyQuotaAfterDemand } from "./_utils/daily-limit-draft";

interface PosMenuGridProps {
  categories: MenuCategory[];
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  onItemTap: (item: MenuItem) => void;
}

interface MenuItemButtonProps {
  item: MenuItem;
  sparseMenu: boolean;
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  onItemTap: (item: MenuItem) => void;
}

interface MenuItemGridProps {
  items: MenuItem[];
  sparseMenu: boolean;
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  onItemTap: (item: MenuItem) => void;
}

const ALL_MENU_VALUE = "all";

interface MenuCardStatus {
  blocked: boolean;
  /** Reason badge shown when blocked at zero; null when not blocked. */
  reasonLabel: string | null;
  /** Remaining-quota label shown whenever finite and not blocked. */
  remainingLabel: string | null;
}

/**
 * Mirrors the reason rule in `findDailyLimitBlockForProposal` /
 * `formatAddToCartBlockMessage` exactly: `manual_limit_quantity == null`
 * means the block came from the stock leg ("Hết nguyên liệu"), otherwise
 * it's the manual quota ("Hết suất") — so the card and the tap-toast never
 * disagree for the same state.
 */
function getMenuCardStatus(
  dailyLimit: ReturnType<typeof useDailyLimit>,
  draftDemand: number,
): MenuCardStatus {
  if (dailyLimit?.is_disabled) {
    return {
      blocked: true,
      reasonLabel: messages.pos.menu.reasonDisabled,
      remainingLabel: null,
    };
  }

  const dailyRemaining = remainingDailyQuotaAfterDemand(
    dailyLimit,
    draftDemand,
  );

  const blocked = dailyRemaining !== null && dailyRemaining <= 0;

  if (blocked) {
    const reasonLabel =
      dailyLimit?.manual_limit_quantity == null
        ? messages.pos.menu.reasonStockExhausted
        : messages.pos.menu.reasonManualExhausted;
    return { blocked: true, reasonLabel, remainingLabel: null };
  }

  return {
    blocked: false,
    reasonLabel: null,
    remainingLabel:
      dailyRemaining === null
        ? null
        : messages.pos.menu.remainingOnCard(dailyRemaining),
  };
}

const MenuItemButton = memo(function MenuItemButton({
  item,
  sparseMenu,
  dailyLimitDemandByMenuItem,
  onItemTap,
}: MenuItemButtonProps) {
  const dailyLimit = useDailyLimit(item.id);
  const draftDemand = dailyLimitDemandByMenuItem?.get(item.id) ?? 0;
  const status = getMenuCardStatus(dailyLimit, draftDemand);
  const blocked = status.blocked;
  const handleClick = useCallback(() => {
    if (blocked) return;
    onItemTap(item);
  }, [blocked, item, onItemTap]);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={blocked}
      aria-disabled={blocked}
      aria-label={`${item.name}, ${formatVND(item.base_price)}`}
      className={cn(
        // aspect-[4/5] keeps the card scaling with width — a fixed min-h
        // gets too tall on mobile (390px width → 2-col gap-3 → ~181×226px
        // per card).
        "group relative aspect-[4/5] h-auto min-w-0 w-full overflow-hidden p-0 text-left transition-transform hover:shadow-effect-card-hover active:scale-[0.97]",
        sparseMenu && "md:aspect-[3/2]",
        blocked && "opacity-60 grayscale",
      )}
      onClick={handleClick}
    >
      {/* Photo fills the card — `object-cover` crops to the frame with no
          white edges; falls back to a muted Utensils icon when the item has
          no image. */}
      <span className="absolute inset-0 block">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            sizes="(min-width: 1536px) 16vw, (min-width: 1280px) 22vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted/50">
            <IconUtensils className="size-6 text-muted-foreground/30" />
          </span>
        )}
      </span>

      {/* Bottom-up black gradient keeps the white item name readable on bright photos. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

      {/* Remaining-quota / block-reason badge — top left, opposite the price. */}
      {status.reasonLabel !== null ? (
        <Badge
          variant="destructive"
          className="absolute left-2 top-2 z-10 md:left-3 md:top-3"
        >
          {status.reasonLabel}
        </Badge>
      ) : status.remainingLabel !== null ? (
        <Badge
          variant="secondary"
          className="absolute left-2 top-2 z-10 md:left-3 md:top-3"
        >
          {status.remainingLabel}
        </Badge>
      ) : null}

      {/* Price — top right, primary badge with shadow. */}
      <span
        className={cn(
          "absolute right-2 top-2 z-10 inline-flex items-center rounded-md bg-primary px-2 py-1 text-sm font-bold tabular-nums text-primary-foreground md:right-3 md:top-3 md:text-base",
          sparseMenu && "md:text-lg",
        )}
      >
        {formatVND(item.base_price)}
      </span>

      {/* Item name — overlaid at the photo bottom; white text + drop shadow for contrast. */}
      <span
        className={cn(
          "pos-text-overlay absolute inset-x-3 bottom-3 z-10 line-clamp-2 text-base font-bold leading-snug text-white md:inset-x-4 md:bottom-4 md:text-lg",
          sparseMenu && "md:text-2xl",
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
  dailyLimitDemandByMenuItem,
  onItemTap,
}: MenuItemGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        sparseMenu
          ? "md:grid-cols-1"
          : "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <MenuItemButton
          key={item.id}
          item={item}
          sparseMenu={sparseMenu}
          dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
          onItemTap={onItemTap}
        />
      ))}
    </div>
  );
});

function PosMenuGridComponent({
  categories,
  dailyLimitDemandByMenuItem,
  onItemTap,
}: PosMenuGridProps) {
  const [, startMenuTransition] = useTransition();
  const [activeTabValue, setActiveTabValue] = useState<string>(ALL_MENU_VALUE);
  // Mobile: the search input is hidden by default and opens from the search
  // icon; while active it replaces the tabs row, with a "Hủy" button to
  // collapse. Desktop (md+) always shows both, so this flag has no effect.
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
    <InputGroup className="h-11 w-full md:max-w-md xl:w-64 xl:max-w-none xl:flex-none 2xl:w-72">
      <InputGroupAddon>
        <IconSearch />
      </InputGroupAddon>
      <InputGroupInput
        id="pos-menu-search"
        value={query}
        onChange={handleQueryChange}
        autoFocus={isSearchActive}
        placeholder={messages.pos.menu.searchPlaceholder}
        aria-label={messages.pos.menu.searchAria}
      />
      {query.trim() !== "" && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            className="relative after:absolute after:-inset-2.5"
            aria-label={messages.pos.menu.clearSearchAria}
            onClick={clearQuery}
          >
            <IconX />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );

  // Unified tabs for mobile + desktop: no muted TabsList container; each tab
  // is a standalone bg-muted/50 chip that flips to primary when active. The
  // count badge (sm+ only) inverts its colors on the active tab.
  // IMPORTANT: TabsTrigger defaults to `flex-1` (stretches across the
  // TabsList width) — `!flex-none` is required so chips keep content width
  // and overflow scrolls horizontally.
  const tabPillClassName =
    "group/tab !flex-none gap-1.5 bg-muted/50 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground md:gap-2 md:px-4";
  const tabBadgeClassName =
    "hidden shrink-0 text-xs sm:inline-flex group-data-[state=active]/tab:border-primary-foreground/30 group-data-[state=active]/tab:bg-primary-foreground/15 group-data-[state=active]/tab:text-primary-foreground";
  const unifiedTabs = (
    <Tabs
      value={activeTabValue}
      onValueChange={handleCategoryChange}
      className="min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden xl:flex-1"
    >
      <TabsList
        aria-label={messages.pos.menu.categoriesAria}
        className="!h-auto w-max min-w-full !justify-start gap-1.5 !bg-transparent !p-0 md:gap-2"
      >
        <TabsTrigger value={ALL_MENU_VALUE} className={tabPillClassName}>
          {messages.pos.menu.all}
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
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/60 bg-background px-3 py-3 md:px-4 md:py-4">
          {/* Mobile: search pill and tab pills share one row. Tap search swaps tabs for input and cancel. */}
          <div className="flex items-center gap-1.5 md:hidden">
            {isSearchActive ? (
              <>
                <div className="min-w-0 flex-1">{searchInput}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="shrink-0 px-3 text-sm font-semibold"
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
                  className="min-w-12 shrink-0 bg-muted/50 px-0 text-muted-foreground hover:bg-muted"
                  aria-label={messages.pos.menu.searchAria}
                  onClick={openSearch}
                >
                  <IconSearch />
                </Button>
                {unifiedTabs}
              </>
            )}
          </div>

          {/* Desktop (md+): search + tabs on one line. */}
          <div className="hidden md:flex md:items-center md:gap-3">
            {searchInput}
            {unifiedTabs}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {visibleItems.length > 0 && isAllMenuActive ? (
            <div className="flex flex-col gap-4 px-2 pb-32 pt-2 md:gap-6 md:px-3 md:py-3 lg:px-4">
              {visibleCategories.map((category) => (
                <section
                  key={category.id}
                  className="flex min-w-0 flex-col gap-3"
                >
                  <div className="sticky top-0 z-10 -mx-2 flex min-w-0 items-center justify-between gap-3 bg-background/95 px-2 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
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
                    dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
                    onItemTap={onItemTap}
                  />
                </section>
              ))}
            </div>
          ) : null}

          {visibleItems.length > 0 && !isAllMenuActive ? (
            <div className="px-2 pb-32 pt-2 md:px-3 md:py-3 lg:px-4">
              <MenuItemGrid
                items={visibleItems}
                sparseMenu={sparseMenu}
                dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
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
