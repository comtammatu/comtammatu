"use client";

import { useCallback, type ChangeEvent } from "react";
import Image from "next/image";
import {
  Plus as IconPlus,
  Search as IconSearch,
  Utensils as IconUtensils,
  X as IconX,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Item } from "@comtammatu/ui/components/item";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { AppEmptyState } from "@/components/surface";
import { normalizeSearch } from "@lib/search";
import type {
  SelfOrderMenuItem,
  SelfOrderMenuVariant,
  SelfOrderMenuCategory,
} from "@lib/self-order/contracts";

const ALL_MENU_VALUE = "all";

export interface MenuPanelProps {
  categories: SelfOrderMenuCategory[];
  activeCategoryValue: string;
  query: string;
  isSearchActive: boolean;
  onQueryChange: (value: string) => void;
  onActiveCategoryChange: (value: string) => void;
  onSearchActiveChange: (value: boolean) => void;
  onAdd: (item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) => void;
}

export function MenuPanel(props: MenuPanelProps) {
  const { categories, activeCategoryValue, query, isSearchActive } = props;

  const availableCategories = categories.filter((c) => c.menu_items.length > 0);
  const allMenuItemCount = availableCategories.reduce(
    (sum, c) => sum + c.menu_items.length,
    0,
  );
  const normalizedQuery = normalizeSearch(query).trim();
  const visibleCategories = normalizedQuery === ""
    ? availableCategories
    : availableCategories
        .map((category) => ({
          ...category,
          menu_items: category.menu_items.filter((item) =>
            normalizeSearch(`${item.name} ${item.description ?? ""}`).includes(normalizedQuery),
          ),
        }))
        .filter((category) => category.menu_items.length > 0);
  const visibleItems = activeCategoryValue === ALL_MENU_VALUE
    ? visibleCategories.flatMap((c) => c.menu_items)
    : visibleCategories.find((c) => String(c.id) === activeCategoryValue)?.menu_items ?? [];
  const isAllMenuActive = activeCategoryValue === ALL_MENU_VALUE;

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => props.onQueryChange(event.target.value),
    [props],
  );

  const searchInput = (
    <InputGroup className="h-11 w-full md:max-w-md lg:w-72 lg:flex-none">
      <InputGroupAddon><IconSearch /></InputGroupAddon>
      <InputGroupInput
        id="self-order-menu-search"
        value={query}
        onChange={handleQueryChange}
        autoFocus={isSearchActive}
        placeholder={SELF_ORDER_VI.searchPlaceholder}
        aria-label={SELF_ORDER_VI.searchAria}
      />
      {query.trim() !== "" ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={SELF_ORDER_VI.clearSearchAria} onClick={() => props.onQueryChange("")}>
            <IconX />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );

  const tabPillClassName = "group/tab !flex-none gap-1.5 bg-muted/50 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground md:px-4";
  const tabBadgeClassName = "hidden shrink-0 text-xs sm:inline-flex group-data-[state=active]/tab:border-primary-foreground/30 group-data-[state=active]/tab:bg-primary-foreground/15 group-data-[state=active]/tab:text-primary-foreground";
  const unifiedTabs = (
    <Tabs value={activeCategoryValue} onValueChange={props.onActiveCategoryChange} className="no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
      <TabsList aria-label={SELF_ORDER_VI.categoriesAria} className="!h-auto w-max min-w-full !justify-start gap-1.5 !bg-transparent !p-0 md:gap-2">
        <TabsTrigger value={ALL_MENU_VALUE} className={tabPillClassName}>
          {SELF_ORDER_VI.allCategories}
          <Badge variant="outline" className={tabBadgeClassName}>{allMenuItemCount}</Badge>
        </TabsTrigger>
        {availableCategories.map((category) => (
          <TabsTrigger key={category.id} value={String(category.id)} className={tabPillClassName}>
            {category.name}
            <Badge variant="outline" className={tabBadgeClassName}>{category.menu_items.length}</Badge>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <section className="min-h-0 flex-1 lg:border-r lg:border-border">
      <div className="border-b border-border bg-background p-3">
        <div className="flex items-center gap-1.5 md:hidden">
          {isSearchActive ? (
            <>
              <div className="min-w-0 flex-1">{searchInput}</div>
              <Button type="button" variant="ghost" size="touch" className="shrink-0 px-3 text-sm font-semibold" onClick={() => { props.onSearchActiveChange(false); props.onQueryChange(""); }}>
                {SELF_ORDER_VI.cancelSearch}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="touch" className="min-w-12 shrink-0 bg-muted/50 px-0 text-muted-foreground hover:bg-muted" aria-label={SELF_ORDER_VI.searchAria} onClick={() => props.onSearchActiveChange(true)}>
                <IconSearch />
              </Button>
              {unifiedTabs}
            </>
          )}
        </div>
        <div className="hidden md:flex md:items-center md:gap-3">
          {searchInput}
          {unifiedTabs}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <h2 className="font-heading text-base font-semibold">{SELF_ORDER_VI.menuTitle}</h2>
      </div>
      <div className="flex flex-col gap-4 p-3">
        {availableCategories.length === 0 ? (
          <AppEmptyState title={SELF_ORDER_VI.menuEmpty} icon={<IconUtensils />} compact />
        ) : visibleItems.length === 0 ? (
          <AppEmptyState title={SELF_ORDER_VI.noResults} icon={<IconSearch />} compact />
        ) : isAllMenuActive ? (
          visibleCategories.map((category) => (
            <section key={category.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading truncate text-base font-semibold">{category.name}</h3>
                <Badge variant="outline">{category.menu_items.length}</Badge>
              </div>
              <MenuItemGrid items={category.menu_items} onAdd={props.onAdd} />
            </section>
          ))
        ) : (
          <MenuItemGrid items={visibleItems} onAdd={props.onAdd} />
        )}
      </div>
    </section>
  );
}

export function MenuItemGrid({
  items,
  onAdd,
}: {
  items: SelfOrderMenuItem[];
  onAdd: (item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
  onAdd: (item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) => void;
}) {
  const variants = item.menu_item_variants;
  if (variants.length === 0) {
    return <MenuPhotoButton item={item} onClick={() => onAdd(item)} />;
  }
  return (
    <Item variant="outline" className="block min-w-0 p-2">
      <MenuPhotoFrame item={item} />
      <div className="mt-2 grid gap-2">
        {variants.map((variant) => (
          <Button key={variant.id} type="button" variant="outline" size="touch" className="w-full justify-between" onClick={() => onAdd(item, variant)}>
            <span className="flex min-w-0 items-center gap-2">
              <IconPlus data-icon="inline-start" />
              <span className="min-w-0 truncate">{variant.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatVND(Number(item.base_price) + Number(variant.price_adjustment))}
            </span>
          </Button>
        ))}
      </div>
    </Item>
  );
}

function MenuPhotoButton({ item, onClick }: { item: SelfOrderMenuItem; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" aria-label={`${item.name}, ${formatVND(Number(item.base_price))}`} className="group relative aspect-square h-auto min-w-0 w-full overflow-hidden p-0 text-left transition-transform active:scale-[0.97]" onClick={onClick}>
      <MenuPhotoContent item={item} />
    </Button>
  );
}

function MenuPhotoFrame({ item }: { item: SelfOrderMenuItem }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted/50">
      <MenuPhotoContent item={item} />
    </div>
  );
}

function MenuPhotoContent({ item }: { item: SelfOrderMenuItem }) {
  return (
    <>
      <span className="absolute inset-0 block">
        {item.image_url ? (
          <Image src={item.image_url} alt="" fill sizes="(min-width: 1280px) 20vw, (min-width: 640px) 50vw, 50vw" className="object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted/50">
            <IconUtensils className="size-6 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <span className="absolute right-2 top-2 inline-flex items-center rounded-md bg-primary px-2 py-1 text-sm font-bold tabular-nums text-primary-foreground">
        {formatVND(Number(item.base_price))}
      </span>
      <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-sm font-bold leading-snug text-white">
        {item.name}
      </span>
    </>
  );
}
