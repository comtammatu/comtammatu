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
        "h-auto min-h-56 w-full cursor-pointer flex-col items-stretch justify-between gap-2 overflow-hidden p-2.5 text-left whitespace-normal shadow-sm transition-transform hover:border-primary/30 hover:shadow-md active:scale-95 md:min-h-64 md:gap-0 md:p-5 lg:min-h-72",
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
                className="object-cover"
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

function PosMenuGridComponent({ categories, onItemTap }: PosMenuGridProps) {
  const [, startMenuTransition] = useTransition();
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(() =>
    categories.find((category) => category.menu_items.length > 0)?.id ?? null,
  );

  const availableCategories = useMemo(
    () => categories.filter((category) => category.menu_items.length > 0),
    [categories],
  );

  useEffect(() => {
    setActiveCategoryId((prev) => {
      const ok = availableCategories.some((category) => category.id === prev);
      return ok ? prev : (availableCategories[0]?.id ?? null);
    });
  }, [availableCategories]);

  const activeCategory = useMemo(
    () =>
      availableCategories.find((category) => category.id === activeCategoryId),
    [availableCategories, activeCategoryId],
  );

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const activeItems = activeCategory?.menu_items ?? [];
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (normalizedQuery === "") return activeItems;

    return activeItems.filter((item) => {
      const haystack = `${item.name} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeItems, normalizedQuery]);
  const sparseMenu = visibleItems.length <= 2;
  const activeCategoryValue =
    activeCategoryId != null ? String(activeCategoryId) : undefined;
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    [],
  );
  const clearQuery = useCallback(() => setQuery(""), []);
  const handleCategoryChange = useCallback(
    (value: string) => {
      const nextCategoryId = Number(value);
      if (!Number.isFinite(nextCategoryId)) return;

      startMenuTransition(() => {
        setActiveCategoryId((current) =>
          current === nextCategoryId ? current : nextCategoryId,
        );
      });
    },
    [startMenuTransition],
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
        <div className="border-b border-border/60 bg-background px-2 py-1.5 md:px-5 md:py-4 lg:px-6">
          <div className="flex flex-col gap-1.5 md:gap-3">
            <div className="flex flex-col gap-1.5 md:gap-2 xl:flex-row xl:items-center">
              <InputGroup className="h-9 w-full md:h-11 md:max-w-md xl:w-64 xl:max-w-none xl:flex-none 2xl:w-72">
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
                value={activeCategoryValue}
                onValueChange={handleCategoryChange}
                className="min-w-0 w-full gap-0 overflow-x-auto overflow-y-hidden xl:flex-1"
              >
                <TabsList
                  aria-label="Danh mục món"
                  className="h-9 w-max min-w-full justify-start gap-1 md:h-11 md:gap-2"
                >
                  {availableCategories.map((category) => (
                    <TabsTrigger
                      key={category.id}
                      value={String(category.id)}
                      className="h-full shrink-0 gap-1.5 px-2.5 py-0 text-sm font-semibold md:gap-2 md:px-4"
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
          <div
            className={cn(
              "grid grid-cols-2 gap-2 px-2 pb-28 pt-2 md:gap-3 md:px-3 md:py-3 lg:px-4",
              sparseMenu
                ? "md:grid-cols-1"
                : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
            )}
          >
            {visibleItems.map((item) => (
              <MenuItemButton
                key={item.id}
                item={item}
                sparseMenu={sparseMenu}
                onItemTap={onItemTap}
              />
            ))}
          </div>

          {visibleItems.length === 0 && (
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
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

export const PosMenuGrid = memo(PosMenuGridComponent);
