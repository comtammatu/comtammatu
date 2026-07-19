/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */
"use client";

import { useMemo, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle,
  CookingPot,
  Save as IconSave,
  Search as IconSearch,
} from "lucide-react";
import {
  AppEmptyState,
  AppSection,
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { Button } from "@comtammatu/ui/components/button";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@comtammatu/ui/components/drawer";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { formatVND } from "@comtammatu/shared/format";
import { normalizeSearch } from "@lib/search";
import { useSwipeReveal, type SwipeReveal } from "@lib/hooks/use-swipe-reveal";
import { useLongPress } from "@lib/hooks/use-long-press";
import { useRealtimeRefresh } from "@/_hooks/use-realtime-refresh";
import {
  type MenuLimitRow,
  clearBranchMenuDailyLimit,
  replenishMenuItemKitchenStock,
  setBranchMenuDailyLimit,
} from "./actions";
import { messages } from "@lib/messages";

interface Props {
  branchId: number;
  rows: MenuLimitRow[];
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

function getAvailableToSellValue(row: MenuLimitRow): number | string {
  return row.available_to_sell ?? messages.pos.menu.unlimited;
}

function getManualLimitValue(row: MenuLimitRow): number | string {
  return row.manual_limit_quantity ?? messages.pos.menu.manualLimitNotSet;
}

function getStockCapacityValue(row: MenuLimitRow): number | string {
  return row.stock_capacity ?? messages.pos.menu.noStockConfig;
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
        <Item
          variant="outline"
          size="sm"
          className="flex-col flex-nowrap items-start rounded-none border-none px-3 py-2 pointer-events-none select-none lg:flex-row lg:items-center lg:px-4 lg:py-3"
        >
          <ItemContent className="min-w-0 w-full gap-1 lg:w-auto">
            <ItemTitle className="line-clamp-2 w-full max-w-full flex-wrap text-sm">
              <span className="min-w-0 break-words">{row.item_name}</span>
              {renderItemBadge(row)}
            </ItemTitle>
            <ItemDescription className="flex flex-wrap items-center gap-2">
              <span className="font-mono tabular-nums text-foreground">
                {formatVND(row.base_price)}
              </span>
            </ItemDescription>
          </ItemContent>
          <ItemContent className="grid w-full shrink-0 grid-cols-3 gap-2 border-t pt-2 text-xs lg:w-80 lg:flex-none lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground">
                {messages.pos.menu.availableToSellLabel}
              </span>
              <strong className="truncate font-mono tabular-nums text-foreground">
                {getAvailableToSellValue(row)}
              </strong>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground">
                {messages.pos.menu.manualLimitShortLabel}
              </span>
              <strong className="truncate font-mono tabular-nums text-foreground">
                {getManualLimitValue(row)}
              </strong>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground">
                {messages.pos.menu.stockCapacityLabel}
              </span>
              <strong className="truncate font-mono tabular-nums text-foreground">
                {getStockCapacityValue(row)}
              </strong>
            </span>
          </ItemContent>
        </Item>
      </div>
    </div>
  );
}

export function MenuLimitsClient({ branchId, rows }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  useRealtimeRefresh({
    deps: [branchId],
    setupChannel: (supabase, scheduleRefresh) => {
      const filter = `branch_id=eq.${String(branchId)}`;
      let initialSubscribe = true;
      return supabase
        .channel(`menu-limits:${String(branchId)}:availability`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "branch_menu_item_daily_limits",
            filter,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "branch_menu_item_daily_holds",
            filter,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "stock_levels",
            filter,
          },
          scheduleRefresh,
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (initialSubscribe) {
            initialSubscribe = false;
            return;
          }
          scheduleRefresh();
        });
    },
  });

  const swipe = useSwipeReveal({ revealWidth: 80 });

  const [drawerRow, setDrawerRow] = useState<MenuLimitRow | null>(null);
  const [draftQty, setDraftQty] = useState<string>("");
  const [draftDisabled, setDraftDisabled] = useState<boolean>(false);
  const [replenishReason, setReplenishReason] = useState("");

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
  const actionCount = summary.exhausted + summary.disabled;

  function openDrawer(row: MenuLimitRow) {
    setDrawerRow(row);
    setDraftQty(
      row.manual_limit_quantity == null
        ? ""
        : String(row.manual_limit_quantity),
    );
    setDraftDisabled(row.is_disabled);
    setReplenishReason("");
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

  function handleReplenishKitchen(extraPortions: 1 | 2) {
    if (!drawerRow) return;
    const reason = replenishReason.trim();
    if (reason.length < 5) {
      toast.error(messages.pos.menu.replenishKitchenReasonMin);
      return;
    }

    startTransition(async () => {
      const result = await replenishMenuItemKitchenStock({
        branchId,
        menuItemId: drawerRow.menu_item_id,
        extraPortions,
        reason,
      });

      if (!result.success) {
        toast.error(result.error ?? messages.pos.menu.replenishKitchenFailed);
        return;
      }

      toast.success(
        messages.pos.menu.replenishKitchenSuccess(
          drawerRow.item_name,
          extraPortions,
        ),
      );
      setDrawerRow(null);
      setReplenishReason("");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <AppEmptyState
        title={messages.pos.menu.empty}
        description={messages.pos.menu.menuLimitsEmptyDescription}
        symbol="roundPlate"
      >
        <Button
          variant="outline"
          size="touch"
          render={<Link href={`/br/${branchId}/settings`} />}
        >
          {messages.settings.branch.branchSettingsBack}
        </Button>
      </AppEmptyState>
    );
  }

  return (
    <>
      <AppToolbar
        search={
          <InputGroup className="w-full lg:w-80">
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
            {actionCount > 0 ? (
              <Badge variant="warning">
                {messages.pos.menu.attentionCount(actionCount)}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {messages.pos.menu.itemCount(summary.total)}
            </Badge>
            <Badge variant="success">
              {messages.pos.menu.limitedCount(summary.limited)}
            </Badge>
            <Badge variant="outline">
              {messages.pos.menu.stockCapacityCount(summary.stockLimited)}
            </Badge>
            {summary.exhausted > 0 ? (
              <Badge variant="warning">
                {messages.pos.menu.exhaustedCount(summary.exhausted)}
              </Badge>
            ) : null}
            {summary.disabled > 0 ? (
              <Badge variant="destructive">
                {messages.pos.menu.disabledCount(summary.disabled)}
              </Badge>
            ) : null}
          </div>
        }
      />

      {grouped.length === 0 ? (
        <AppEmptyState
          title={messages.pos.menu.noResults}
          compact
          symbol="roundPlate"
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {grouped.map((group) => (
          <AppSection
            key={group.categoryId}
            title={group.categoryName}
            size="sm"
            badge={{
              children: messages.pos.menu.itemCount(group.items.length),
              variant: "outline",
            }}
            contentFlush
          >
            <ItemGroup className="gap-1">
              {group.items.map((row) => (
                <MenuLimitRowItem
                  key={row.menu_item_id}
                  row={row}
                  onOpenDrawer={() => openDrawer(row)}
                  onToggleStatus={(disabled) =>
                    handleToggleStatus(row, disabled)
                  }
                  isPending={isPending}
                  swipe={swipe}
                />
              ))}
            </ItemGroup>
          </AppSection>
        ))}
      </div>

      <Drawer
        open={!!drawerRow}
        onOpenChange={(open) => !open && setDrawerRow(null)}
      >
        <DrawerContent className="overflow-hidden">
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerRow.item_name}</DrawerTitle>
                <DrawerDescription
                  render={
                    <div className="flex flex-wrap justify-center gap-1.5 lg:justify-start">
                      {renderItemBadge(drawerRow)}
                      <Badge variant="outline" className="font-mono">
                        {formatVND(drawerRow.base_price)}
                      </Badge>
                    </div>
                  }
                ></DrawerDescription>
              </DrawerHeader>
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-2">
                <Item variant="muted" size="sm" className="items-center">
                  <ItemContent>
                    <ItemTitle>
                      {messages.pos.menu.availableToSellLabel}
                    </ItemTitle>
                    <ItemDescription>
                      {messages.pos.menu.availabilityRuleHint}
                    </ItemDescription>
                  </ItemContent>
                  <strong className="shrink-0 font-mono tabular-nums text-foreground">
                    {getAvailableToSellValue(drawerRow)}
                  </strong>
                </Item>
                <DescriptionList
                  className="grid grid-cols-2 gap-x-4 gap-y-3"
                  items={[
                    {
                      term: messages.pos.menu.manualLimitShortLabel,
                      description: getManualLimitValue(drawerRow),
                    },
                    {
                      term: messages.pos.menu.stockCapacityLabel,
                      description: getStockCapacityValue(drawerRow),
                    },
                    {
                      term: messages.pos.menu.soldTodayLabel,
                      description: drawerRow.sold_today,
                    },
                    {
                      term: messages.pos.menu.pendingDemandLabel,
                      description: drawerRow.pending_unfinalized_demand,
                    },
                    {
                      term: messages.pos.menu.activeHoldDemandLabel,
                      description: drawerRow.active_hold_demand,
                    },
                  ]}
                  descriptionClassName="font-mono tabular-nums"
                />
                <FieldGroup className="gap-4">
                  <Item
                    variant="muted"
                    className="items-center justify-between"
                    render={<Field orientation="horizontal" />}
                  >
                    <FieldContent>
                      <FieldLabel htmlFor="menu-limit-disabled">
                        {messages.pos.menu.servingStatusLabel}
                      </FieldLabel>
                      <FieldDescription>
                        {messages.pos.menu.servingStatusHint}
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="menu-limit-disabled"
                      size="touch"
                      checked={draftDisabled}
                      onCheckedChange={setDraftDisabled}
                    />
                  </Item>

                  <Field>
                    <FieldLabel htmlFor="menu-limit-quantity">
                      {messages.pos.menu.manualLimitOptionalLabel}
                    </FieldLabel>
                    <QuantityInput
                      id="menu-limit-quantity"
                      maxFractionDigits={0}
                      max={9999}
                      placeholder={messages.pos.menu.manualLimitExample}
                      value={draftQty}
                      onValueChange={setDraftQty}
                      aria-label={messages.pos.menu.manualLimitInputAria(
                        drawerRow.item_name,
                      )}
                    />
                    <FieldDescription>
                      {messages.pos.menu.manualLimitOptionalHint}
                    </FieldDescription>
                  </Field>
                </FieldGroup>

                <div className="flex flex-col gap-3 border-t pt-3">
                  <SectionLabel>
                    {messages.pos.menu.replenishKitchenTitle}
                  </SectionLabel>
                  <p className="text-xs text-muted-foreground">
                    {messages.pos.menu.replenishKitchenHint}
                  </p>
                  <Field>
                    <FieldLabel htmlFor="menu-limit-replenish-reason">
                      {messages.pos.menu.replenishKitchenReasonLabel}
                    </FieldLabel>
                    <Textarea
                      id="menu-limit-replenish-reason"
                      value={replenishReason}
                      onChange={(event) =>
                        setReplenishReason(event.target.value)
                      }
                      placeholder={
                        messages.pos.menu.replenishKitchenPlaceholder
                      }
                      disabled={isPending}
                      className="min-h-20 resize-none text-base"
                    />
                    <FieldDescription>
                      {messages.pos.menu.replenishKitchenReasonHint}
                    </FieldDescription>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      disabled={isPending}
                      onClick={() => handleReplenishKitchen(1)}
                    >
                      <CookingPot />
                      +1 suất
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      disabled={isPending}
                      onClick={() => handleReplenishKitchen(2)}
                    >
                      <CookingPot />
                      +2 suất
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter className="flex-row gap-2">
                {drawerRow.manual_limit_quantity != null && (
                  <Button
                    variant="outline"
                    size="touch"
                    className="flex-1"
                    onClick={handleClearLimit}
                    disabled={isPending}
                  >
                    {messages.pos.menu.clearLimit}
                  </Button>
                )}
                <Button
                  size="touch"
                  className="flex-1"
                  onClick={handleSaveLimit}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Spinner className="mr-2" />
                  ) : (
                    <IconSave className="mr-2 size-4" />
                  )}
                  {messages.pos.menu.saveChanges}
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
