/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */
"use client";

import { useMemo, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle,
  Save as IconSave,
  Search as IconSearch,
} from "lucide-react";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { QuantityInput } from "@/components/form";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Progress } from "@comtammatu/ui/components/progress";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@comtammatu/ui/components/drawer";
import { formatVND } from "@comtammatu/shared/format";
import { normalizeSearch } from "@lib/search";
import { useSwipeReveal, type SwipeReveal } from "@lib/hooks/use-swipe-reveal";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  type MenuLimitRow,
  clearBranchMenuDailyLimit,
  setBranchMenuDailyLimit,
} from "./actions";
import { messages } from "@lib/messages";

interface Props {
  branchId: number;
  rows: MenuLimitRow[];
}

function getSoldProgress(row: MenuLimitRow): {
  sold: number;
  remaining: number;
  value: number;
} | null {
  if (row.available_to_sell == null) return null;

  const sold = Math.max(0, row.sold_today);
  const total = sold + row.available_to_sell;
  const value =
    total <= 0
      ? sold > 0
        ? 100
        : 0
      : Math.min(100, Math.round((sold / total) * 100));

  return { sold, remaining: row.available_to_sell, value };
}

function getItemBadge(row: MenuLimitRow): {
  label: string;
  variant: BadgeProps["variant"];
} | null {
  if (row.is_disabled) {
    return { label: messages.pos.menu.disabled, variant: "destructive" };
  }

  if (row.available_to_sell !== null && row.available_to_sell <= 0) {
    return { label: messages.pos.menu.soldOut, variant: "warning" };
  }

  return null;
}

function renderItemBadge(row: MenuLimitRow) {
  const badge = getItemBadge(row);
  return badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null;
}

function getMenuLimitQueuePriority(row: MenuLimitRow): number {
  if (row.is_disabled) return 0;
  if (row.available_to_sell !== null && row.available_to_sell <= 0) return 1;
  if (row.available_to_sell !== null && row.available_to_sell <= 5) return 3;
  return 10;
}

function compareMenuLimitRows(a: MenuLimitRow, b: MenuLimitRow): number {
  return (
    getMenuLimitQueuePriority(a) - getMenuLimitQueuePriority(b) ||
    a.item_name.localeCompare(b.item_name, "vi")
  );
}

function MenuLimitRowItem({
  row,
  onOpenDrawer,
  onToggleStatus,
  isPending,
  swipe,
}: {
  row: MenuLimitRow;
  onOpenDrawer: () => void;
  onToggleStatus: (isDisabled: boolean) => void;
  isPending: boolean;
  swipe: SwipeReveal;
}) {
  const rowId = String(row.menu_item_id);
  const isRevealed = swipe.isRevealed(rowId);
  const swipeBindings = swipe.bindings(rowId);

  const longPress = useLongPress({
    onLongPress: onOpenDrawer,
    onClick: () => {
      if (swipe.consumeSuppression(rowId)) {
        swipe.clearReveal();
        return;
      }
      if (isRevealed) {
        swipe.clearReveal();
        return;
      }
      onOpenDrawer();
    },
  });

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerDown(e);
      longPress.onPointerDown(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerMove(e);
      longPress.onPointerMove(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerUp(e);
      longPress.onPointerUp();
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerCancel(e);
      longPress.onPointerCancel();
    },
    onContextMenu: longPress.onContextMenu,
  };

  const progress = getSoldProgress(row);

  return (
    <div className="relative overflow-hidden w-full bg-background border-b last:border-b-0">
      <div className="absolute inset-y-0 right-0 flex">
        <Button
          variant={row.is_disabled ? "default" : "destructive"}
          className="h-full rounded-none w-20"
          disabled={isPending}
          onClick={() => {
            swipe.clearReveal();
            onToggleStatus(!row.is_disabled);
          }}
        >
          {row.is_disabled ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <Ban className="h-5 w-5" />
          )}
        </Button>
      </div>
      <div
        className="relative bg-background z-10 touch-pan-y"
        style={{
          transform: isRevealed ? `translate3d(-80px, 0, 0)` : undefined,
          transition: swipeBindings ? undefined : "transform 0.2s ease-out",
        }}
        {...handlers}
      >
        <Item variant="outline" className="flex flex-col p-4 pointer-events-none select-none h-full border-none">
          <ItemHeader className="items-start">
            <ItemContent className="min-w-0 gap-1 w-full">
              <ItemTitle className="line-clamp-2 w-full flex-wrap text-sm">
                <span className="min-w-0">{row.item_name}</span>
                {renderItemBadge(row)}
              </ItemTitle>
              <ItemDescription className="flex flex-wrap items-center gap-2">
                <span className="font-mono tabular-nums text-foreground">
                  {formatVND(row.base_price)}
                </span>
                {row.stock_capacity != null && (
                  <span>
                    {messages.pos.menu.stockCapacityLabel}:{" "}
                    <span className="font-mono text-sm tabular-nums">
                      {row.stock_capacity}
                    </span>
                  </span>
                )}
                {row.manual_limit_quantity != null && (
                  <Badge variant="outline" className="text-xs font-mono ml-auto">
                    Giới hạn: {row.manual_limit_quantity}
                  </Badge>
                )}
              </ItemDescription>
            </ItemContent>
          </ItemHeader>
          {progress && (
            <div className="mt-2 w-full">
              <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                <span className="font-mono tabular-nums text-destructive">
                  {messages.pos.menu.soldCount(progress.sold)}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {messages.pos.menu.remainingCount(progress.remaining)}
                </span>
              </div>
              <Progress
                value={progress.value}
                tone="destructive"
              />
            </div>
          )}
        </Item>
      </div>
    </div>
  );
}

export function MenuLimitsTable({ branchId, rows }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const swipe = useSwipeReveal({ revealWidth: 80 });

  const [drawerRow, setDrawerRow] = useState<MenuLimitRow | null>(null);
  const [draftQty, setDraftQty] = useState<string>("");
  const [draftDisabled, setDraftDisabled] = useState<boolean>(false);

  const grouped = useMemo(() => {
    const needle = normalizeSearch(query).trim();
    const map = new Map<
      number,
      { categoryId: number; categoryName: string; items: MenuLimitRow[] }
    >();

    for (const row of rows) {
      if (needle) {
        const haystack = normalizeSearch(
          `${row.item_name} ${row.category_name}`,
        );
        if (!haystack.includes(needle)) continue;
      }

      const existing = map.get(row.category_id);
      if (existing) {
        existing.items.push(row);
      } else {
        map.set(row.category_id, {
          categoryId: row.category_id,
          categoryName: row.category_name,
          items: [row],
        });
      }
    }

    const groups = Array.from(map.values()).map((group) => ({
      ...group,
      items: [...group.items].sort(compareMenuLimitRows),
    }));
    groups.sort((a, b) => {
      const aPriority = Math.min(
        ...a.items.map((item) => getMenuLimitQueuePriority(item)),
      );
      const bPriority = Math.min(
        ...b.items.map((item) => getMenuLimitQueuePriority(item)),
      );
      return (
        aPriority - bPriority ||
        a.categoryName.localeCompare(b.categoryName, "vi")
      );
    });
    return groups;
  }, [query, rows]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      limited: rows.filter((row) => row.manual_limit_quantity !== null).length,
      stockLimited: rows.filter((row) => row.stock_capacity !== null).length,
      disabled: rows.filter((row) => row.is_disabled).length,
      exhausted: rows.filter((row) => {
        return (
          !row.is_disabled &&
          row.available_to_sell !== null &&
          row.available_to_sell <= 0
        );
      }).length,
    }),
    [rows],
  );

  function openDrawer(row: MenuLimitRow) {
    setDrawerRow(row);
    setDraftQty(row.manual_limit_quantity == null ? "" : String(row.manual_limit_quantity));
    setDraftDisabled(row.is_disabled);
  }

  function handleSaveLimit() {
    if (!drawerRow) return;
    const trimmed = draftQty.trim();
    let parsed: number | null = null;
    if (trimmed !== "") {
      parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
        toast.error(messages.pos.menu.manualLimitRange);
        return;
      }
    }

    startTransition(async () => {
      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: drawerRow.menu_item_id,
        limitQuantity: parsed,
        isDisabled: draftDisabled,
      });

      if (!result.success) {
        toast.error(result.error ?? messages.pos.menu.saveLimitFailed);
        return;
      }

      toast.success(messages.pos.menu.limitUpdated(drawerRow.item_name));
      setDrawerRow(null);
      router.refresh();
    });
  }

  function handleToggleStatus(row: MenuLimitRow, isDisabled: boolean) {
    startTransition(async () => {
      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
        limitQuantity: row.manual_limit_quantity,
        isDisabled,
      });

      if (!result.success) {
        toast.error(result.error ?? messages.pos.menu.saveLimitFailed);
        return;
      }
      toast.success(messages.pos.menu.limitUpdated(row.item_name));
      router.refresh();
    });
  }

  function handleClearLimit() {
    if (!drawerRow) return;
    startTransition(async () => {
      const result = await clearBranchMenuDailyLimit({
        branchId,
        menuItemId: drawerRow.menu_item_id,
      });
      if (!result.success) {
        toast.error(result.error ?? messages.pos.menu.clearLimitFailed);
        return;
      }
      toast.success(messages.pos.menu.limitUpdated(drawerRow.item_name));
      setDrawerRow(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <AppEmptyState
        title={messages.pos.menu.empty}
        description={messages.pos.menu.menuLimitsEmptyDescription}
      >
        <Button asChild variant="outline" size="touch">
          <Link href={`/br/${branchId}/settings`}>
            {messages.settings.branch.branchSettingsBack}
          </Link>
        </Button>
      </AppEmptyState>
    );
  }

  return (
    <>
      <AppToolbar
        search={
          <InputGroup className="w-full sm:w-80">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={messages.pos.menu.searchPlaceholder}
              aria-label={messages.pos.menu.searchAria}
            />
          </InputGroup>
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">
              {messages.pos.menu.itemCount(summary.total)}
            </Badge>
            <Badge variant="success">
              {messages.pos.menu.limitedCount(summary.limited)}
            </Badge>
            <Badge variant="outline">
              {messages.pos.menu.stockCapacityCount(summary.stockLimited)}
            </Badge>
            <Badge variant="warning">
              {messages.pos.menu.exhaustedCount(summary.exhausted)}
            </Badge>
            <Badge variant="destructive">
              {messages.pos.menu.disabledCount(summary.disabled)}
            </Badge>
          </div>
        }
      />

      {grouped.length === 0 ? (
        <AppEmptyState title={messages.pos.menu.noResults} compact />
      ) : null}

      <div className="flex flex-col gap-4">
        {grouped.map((group) => (
          <AppSection
            key={group.categoryId}
            title={group.categoryName}
            badge={{
              children: messages.pos.menu.itemCount(group.items.length),
              variant: "outline",
            }}
            contentFlush
          >
          <ItemGroup>
              {group.items.map((row) => (
                <MenuLimitRowItem
                  key={row.menu_item_id}
                  row={row}
                  onOpenDrawer={() => openDrawer(row)}
                  onToggleStatus={(disabled) => handleToggleStatus(row, disabled)}
                  isPending={isPending}
                  swipe={swipe}
                />
              ))}
          </ItemGroup>
          </AppSection>
        ))}
      </div>

      <Drawer open={!!drawerRow} onOpenChange={(open) => !open && setDrawerRow(null)}>
        <DrawerContent>
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerRow.item_name}</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 py-2 flex flex-col gap-6 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">Trạng thái phục vụ</span>
                    <span className="text-xs text-muted-foreground">Khóa món nếu không thể phục vụ</span>
                  </div>
                  <Switch
                    checked={draftDisabled}
                    onCheckedChange={setDraftDisabled}
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm">Giới hạn số lượng (Tùy chọn)</span>
                    <span className="text-xs text-muted-foreground">Để trống nếu không giới hạn tay</span>
                  </div>
                  <QuantityInput
                    maxFractionDigits={0}
                    max={9999}
                    placeholder="VD: 50"
                    value={draftQty}
                    onValueChange={setDraftQty}
                  />
                </div>
              </div>
              <DrawerFooter className="flex-row gap-3">
                {drawerRow.manual_limit_quantity != null && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleClearLimit}
                    disabled={isPending}
                  >
                    Xóa giới hạn
                  </Button>
                )}
                <Button
                  className="flex-1"
                  onClick={handleSaveLimit}
                  disabled={isPending}
                >
                  {isPending ? <Spinner className="mr-2" /> : <IconSave className="mr-2 w-4 h-4" />}
                  Lưu thay đổi
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
