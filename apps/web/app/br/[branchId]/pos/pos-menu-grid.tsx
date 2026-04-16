"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { formatVND } from "@comtammatu/shared/format";
import type { CategoryType } from "@comtammatu/shared";
import { CATEGORY_TYPE_LABELS } from "@comtammatu/shared/menu";
import { MENU_ZONE_ORDER } from "./pos-menu-types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";

interface PosMenuGridProps {
  categories: MenuCategory[];
  cartQuantity: number;
  cartTotal: number;
  onItemTap: (item: MenuItem) => void;
}

export function PosMenuGrid({
  categories,
  cartQuantity,
  cartTotal,
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
      MENU_ZONE_ORDER.filter((z) =>
        categories.some((c) => c.type === z && c.menu_items.length > 0),
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
        (c) => c.type === effectiveMenuZone && c.menu_items.length > 0,
      ),
    [categories, effectiveMenuZone],
  );

  useEffect(() => {
    setActiveCategoryId((prev) => {
      const ok = categoriesInActiveZone.some((c) => c.id === prev);
      return ok ? prev : (categoriesInActiveZone[0]?.id ?? null);
    });
  }, [categoriesInActiveZone]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId),
    [categories, activeCategoryId],
  );

  const activeZoneLabel = CATEGORY_TYPE_LABELS[effectiveMenuZone] ?? effectiveMenuZone;
  const activeMenuItemCount = activeCategory?.menu_items.length ?? 0;

  if (availableMenuZones.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <p className="text-sm font-medium">Chưa có món trong thực đơn</p>
        <p className="text-xs leading-5">
          Thêm danh mục và món trong quản trị để phục vụ tại POS.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border/60 px-3 py-3 md:px-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Khu thực đơn</p>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                {activeZoneLabel}
              </h2>
              <p className="text-sm text-muted-foreground">
                {activeCategory?.name ?? "Chọn danh mục để bắt đầu thêm món"} ·{" "}
                {activeMenuItemCount} món khả dụng
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="app-subpanel px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Danh mục
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {categoriesInActiveZone.length}
                </p>
              </div>
              <div className="app-subpanel border-primary/15 bg-primary/8 px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Giỏ hiện tại
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {cartQuantity} món
                </p>
              </div>
              <div className="app-subpanel border-success/15 bg-success/10 px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-wide text-success">
                  Tạm tính
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {formatVND(cartTotal)}
                </p>
              </div>
            </div>
          </div>

          <ScrollArea className="w-full">
            <div
              className="flex gap-2 pb-1"
              role="tablist"
              aria-label="Khu thực đơn"
            >
              {availableMenuZones.map((z) => (
                <button
                  key={z}
                  type="button"
                  role="tab"
                  aria-selected={effectiveMenuZone === z}
                  className={cn(
                    "min-h-11 min-w-11 flex h-11 shrink-0 cursor-pointer items-center rounded-lg border px-4 text-sm font-semibold transition-all",
                    effectiveMenuZone === z
                      ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
                      : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => setActiveMenuZone(z)}
                >
                  {CATEGORY_TYPE_LABELS[z] ?? z}
                </button>
              ))}
            </div>
          </ScrollArea>

          {categoriesInActiveZone.length > 1 ? (
            <ScrollArea className="w-full">
              <div
                className="flex gap-2 pb-1"
                role="tablist"
                aria-label="Danh mục món"
              >
                {categoriesInActiveZone.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCategoryId === cat.id}
                    className={cn(
                      "min-h-11 min-w-11 flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all",
                      activeCategoryId === cat.id
                        ? "border-primary/25 bg-primary/10 text-primary font-semibold shadow-sm"
                        : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => setActiveCategoryId(cat.id)}
                  >
                    {cat.name}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        activeCategoryId === cat.id &&
                          "border-primary/30 bg-primary/10 text-primary",
                      )}
                    >
                      {cat.menu_items.length}
                    </Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          ) : null}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 md:p-4 xl:grid-cols-3 2xl:grid-cols-4">
          {activeCategory?.menu_items.map((item) => {
            const hasCustomization =
              item.menu_item_variants.length > 0 ||
              item.menu_item_modifiers.length > 0 ||
              item.menu_item_available_sides.length > 0;

            return (
              <button
                key={item.id}
                type="button"
                className="app-subpanel min-h-14 min-w-14 flex min-h-40 cursor-pointer flex-col p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985]"
                onClick={() => onItemTap(item)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                      {activeCategory?.name ?? activeZoneLabel}
                    </span>
                    <div>
                      <p className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">
                        {item.name}
                      </p>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {item.description ??
                              "Chạm để thêm nhanh hoặc mở tuỳ chọn của món."}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      hasCustomization
                        ? "bg-warning/12 text-warning"
                        : "bg-success/10 text-success",
                    )}
                  >
                    {hasCustomization ? "Tùy chỉnh" : "Thêm nhanh"}
                  </span>
                </div>

                <div className="mt-auto space-y-3 pt-6">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {item.menu_item_variants.length > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        {item.menu_item_variants.length} lựa chọn
                      </span>
                    )}
                    {item.menu_item_modifiers.length > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        {item.menu_item_modifiers.length} topping
                      </span>
                    )}
                    {item.menu_item_available_sides.length > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        {item.menu_item_available_sides.length} món kèm
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Giá bán
                      </p>
                      <p className="mt-1 text-xl font-bold text-primary">
                        {formatVND(item.base_price)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      Chạm để chọn
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {activeCategory?.menu_items.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Không có món trong danh mục này
          </div>
        )}
      </ScrollArea>
    </>
  );
}
