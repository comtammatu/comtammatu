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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
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
import type { DeliveryPlatform, OrderType } from "./types";
import { resolvePosMenuListPrice } from "./_lib/delivery-channel";
import { useDailyLimit } from "./_providers/pos-desktop-provider";
import { useCartItemQuantity } from "./_hooks/use-cart";
import { remainingDailyQuotaAfterDemand } from "./_utils/daily-limit-draft";

interface PosMenuGridProps {
  categories: MenuCategory[];
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  orderType?: OrderType;
  deliveryPlatform?: DeliveryPlatform | null;
  onItemTap: (item: MenuItem) => void;
}

interface MenuItemButtonProps {
  item: MenuItem;
  sparseMenu: boolean;
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  orderType: OrderType;
  deliveryPlatform: DeliveryPlatform | null;
  onItemTap: (item: MenuItem) => void;
}

interface MenuItemGridProps {
  items: MenuItem[];
  sparseMenu: boolean;
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  orderType: OrderType;
  deliveryPlatform: DeliveryPlatform | null;
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
        : (dailyLimit?.stock_allowance_quantity ?? 0) > 0
          ? `${messages.pos.menu.sellingOnAllowance} · ${messages.pos.menu.remainingOnCard(dailyRemaining)}`
          : messages.pos.menu.remainingOnCard(dailyRemaining),
  };
}

const MenuItemButton = memo(function MenuItemButton({
  item,
  sparseMenu,
  dailyLimitDemandByMenuItem,
  orderType,
  deliveryPlatform,
  onItemTap,
}: MenuItemButtonProps) {
  const dailyLimit = useDailyLimit(item.id);
  const inCartQuantity = useCartItemQuantity(item.id);
  const draftDemand = dailyLimitDemandByMenuItem?.get(item.id) ?? 0;
  const status = getMenuCardStatus(dailyLimit, draftDemand);
  const listPrice = resolvePosMenuListPrice(item, orderType, deliveryPlatform);
  const channelBlocked =
    orderType === "delivery" && deliveryPlatform != null && !listPrice.ok;
  const blocked = status.blocked || channelBlocked;
  const displayPrice = listPrice.ok ? listPrice.unitPrice : item.base_price;
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
      aria-label={`${item.name}, ${formatVND(displayPrice)}`}
      className={cn(
        // aspect-[1/1] on mobile gives compact square cards, displaying 6-8 items
        // per viewport instead of 3, while preserving sm/md landscape layout.
        "group relative aspect-[1/1] sm:aspect-[4/3] md:aspect-[4/3] h-auto min-w-0 w-full overflow-hidden p-0 text-left transition-transform hover:shadow-effect-card-hover active:scale-[0.97] touch-manipulation select-none chrome-tap",
        sparseMenu && "md:aspect-[3/2]",
        blocked && "opacity-60 grayscale",
        inCartQuantity > 0 && "ring-2 ring-primary",
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

      {/* Top Header — Left: In-cart count + reason/quota badges, Right: Price */}
      <div className="absolute inset-x-1.5 top-1.5 z-10 flex items-start justify-between gap-1 sm:inset-x-2 sm:top-2 md:inset-x-3 md:top-3">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          {inCartQuantity > 0 ? (
            <Badge
              variant="default"
              className="border border-primary-foreground/30 bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground sm:text-sm"
            >
              {inCartQuantity}
            </Badge>
          ) : null}
          {status.reasonLabel !== null ? (
            <Badge
              variant="destructive"
              className="max-w-full truncate text-xs font-semibold"
            >
              {status.reasonLabel}
            </Badge>
          ) : channelBlocked ? (
            <Badge variant="destructive" className="max-w-full truncate text-xs font-semibold">
              {messages.pos.menu.soldOut}
            </Badge>
          ) : status.remainingLabel !== null ? (
            <Badge
              variant="secondary"
              className="max-w-full truncate text-xs font-semibold"
            >
              {status.remainingLabel}
            </Badge>
          ) : null}
        </div>

        {/* Price — top right, primary badge. */}
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded bg-primary px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary-foreground sm:px-2 sm:py-1 sm:text-sm md:text-base",
            sparseMenu && "md:text-lg",
          )}
        >
          {formatVND(displayPrice)}
        </span>
      </div>

      {/* Item name — overlaid at the photo bottom; white text + drop shadow for contrast. */}
      <span
        className={cn(
          "pos-text-overlay absolute inset-x-2 bottom-1.5 z-10 line-clamp-2 text-xs font-bold leading-tight text-white sm:inset-x-3 sm:bottom-2.5 sm:text-sm md:inset-x-4 md:bottom-3 md:text-base",
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
  orderType,
  deliveryPlatform,
  onItemTap,
}: MenuItemGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:gap-3",
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
          orderType={orderType}
          deliveryPlatform={deliveryPlatform}
          onItemTap={onItemTap}
        />
      ))}
    </div>
  );
});

function PosMenuGridComponent({
  categories,
  dailyLimitDemandByMenuItem,
  orderType = "takeaway",
  deliveryPlatform = null,
  onItemTap,
}: PosMenuGridProps) {
  const isCompactMenu = useIsMobile();
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
    <InputGroup
      size="touch"
      className="w-full md:max-w-md xl:w-64 xl:max-w-none xl:flex-none 2xl:w-72"
    >
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
        className="text-base md:text-sm"
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
    "group/tab !flex-none gap-1 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-sm md:gap-2 md:px-4 touch-manipulation select-none chrome-tap min-h-10";
  const tabBadgeClassName =
    "hidden shrink-0 text-xs sm:inline-flex group-data-[state=active]/tab:border-primary-foreground/30 group-data-[state=active]/tab:bg-primary-foreground/15 group-data-[state=active]/tab:text-primary-foreground";
  const unifiedTabs = (
    <Tabs
      value={activeTabValue}
      onValueChange={handleCategoryChange}
      className="min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x xl:flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        <div className="border-b border-border/60 bg-background px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3">
          {isCompactMenu ? (
            <div className="flex items-center gap-1.5">
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
                    size="icon-touch"
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
          ) : (
            <div className="flex items-center gap-3">
              {searchInput}
              {unifiedTabs}
            </div>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {visibleItems.length > 0 && isAllMenuActive ? (
            <div
              className={cn(
                "flex flex-col gap-3 px-2 pt-2 pb-32 md:gap-5 md:px-3 md:pt-3 lg:px-4 xl:pb-4",
              )}
            >
              {visibleCategories.map((category) => (
                <section
                  key={category.id}
                  className="flex min-w-0 flex-col gap-2 sm:gap-3"
                >
                  <div className="sticky top-0 z-10 -mx-2 flex min-w-0 items-center justify-between gap-3 bg-background/95 px-2 py-1.5 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
                    <h2 className="font-heading truncate text-sm font-semibold text-foreground sm:text-base">
                      {category.name}
                    </h2>
                    <Badge variant="outline" className="shrink-0 text-xs sm:text-sm">
                      {category.menu_items.length}
                    </Badge>
                  </div>
                  <MenuItemGrid
                    items={category.menu_items}
                    sparseMenu={false}
                    dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
                    orderType={orderType}
                    deliveryPlatform={deliveryPlatform}
                    onItemTap={onItemTap}
                  />
                </section>
              ))}
            </div>
          ) : null}

          {visibleItems.length > 0 && !isAllMenuActive ? (
            <div className="px-2 pt-2 pb-32 md:px-3 md:pt-3 lg:px-4 xl:pb-4">
              <MenuItemGrid
                items={visibleItems}
                sparseMenu={sparseMenu}
                dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
                orderType={orderType}
                deliveryPlatform={deliveryPlatform}
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
