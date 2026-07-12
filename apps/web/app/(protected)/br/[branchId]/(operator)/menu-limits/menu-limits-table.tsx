/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  CookingPot,
  Save as IconSave,
  Search as IconSearch,
} from "lucide-react";
import { AppEmptyState } from "@/components/surface";
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
  ItemActions,
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
import { normalizeSearch } from "@lib/search";
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
  isPending,
}: {
  row: MenuLimitRow;
  onOpenDrawer: () => void;
  isPending: boolean;
}) {
  return (
    <Item
      asChild
      variant="outline"
      size="sm"
      className="chrome-tap relative flex-col flex-nowrap items-start rounded-none border-x-0 border-t-0 px-3 py-2 text-left select-none last:border-b-0 active:bg-muted/50 lg:flex-row lg:items-center lg:px-4 lg:py-3"
    >
      <button type="button" onClick={onOpenDrawer} disabled={isPending}>
        <ItemContent className="min-w-0 w-full gap-1 lg:w-auto">
          <ItemTitle className="line-clamp-2 w-full max-w-full flex-wrap text-sm">
            <span className="min-w-0 break-words">{row.item_name}</span>
            {renderItemBadge(row)}
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {messages.pos.menu.availableToSellLabel}:{" "}
              {getAvailableToSellValue(row)}
            </span>
          </ItemDescription>
        </ItemContent>
        <ItemActions className="absolute top-3 right-3 text-muted-foreground lg:static">
          <ChevronRight aria-hidden="true" className="size-4" />
        </ItemActions>
      </button>
    </Item>
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

  const [drawerRow, setDrawerRow] = useState<MenuLimitRow | null>(null);
  const [draftQty, setDraftQty] = useState<string>("");
  const [draftDisabled, setDraftDisabled] = useState<boolean>(false);
  const [replenishReason, setReplenishReason] = useState("");
  const [drawerMode, setDrawerMode] = useState<"limit" | "replenish">("limit");

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

  const actionCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.is_disabled ||
          (row.available_to_sell !== null && row.available_to_sell <= 0),
      ).length,
    [rows],
  );

  function openDrawer(row: MenuLimitRow) {
    setDrawerRow(row);
    setDraftQty(
      row.manual_limit_quantity == null
        ? ""
        : String(row.manual_limit_quantity),
    );
    setDraftDisabled(row.is_disabled);
    setReplenishReason("");
    setDrawerMode("limit");
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="w-full sm:flex-1">
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
        {actionCount > 0 ? (
          <Badge variant="warning" className="self-start sm:self-auto">
            {messages.pos.menu.attentionCount(actionCount)}
          </Badge>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <AppEmptyState
          title={messages.pos.menu.noResults}
          compact
          symbol="roundPlate"
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {grouped.map((group) => (
          <section
            key={group.categoryId}
            className="flex flex-col gap-1"
            aria-label={group.categoryName}
          >
            <SectionLabel density="dense">{group.categoryName}</SectionLabel>
            <ItemGroup className="gap-1">
              {group.items.map((row) => (
                <MenuLimitRowItem
                  key={row.menu_item_id}
                  row={row}
                  onOpenDrawer={() => openDrawer(row)}
                  isPending={isPending}
                />
              ))}
            </ItemGroup>
          </section>
        ))}
      </div>

      <Drawer
        open={!!drawerRow}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerRow(null);
            setDrawerMode("limit");
            setReplenishReason("");
          }
        }}
      >
        <DrawerContent className="overflow-hidden">
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>
                  {drawerMode === "limit"
                    ? drawerRow.item_name
                    : messages.pos.menu.replenishKitchenTitle}
                </DrawerTitle>
                <DrawerDescription>
                  {drawerMode === "limit"
                    ? messages.pos.menu.availabilityRuleHint
                    : `${drawerRow.item_name} · ${messages.pos.menu.replenishKitchenHint}`}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-2">
                {drawerMode === "limit" ? (
                  <>
                    <Item variant="muted" size="sm" className="items-center">
                      <ItemContent>
                        <ItemTitle>
                          {messages.pos.menu.availableToSellLabel}
                        </ItemTitle>
                      </ItemContent>
                      <strong className="shrink-0 font-mono tabular-nums text-foreground">
                        {getAvailableToSellValue(drawerRow)}
                      </strong>
                    </Item>
                    <FieldGroup className="gap-4">
                      <Item
                        asChild
                        variant="muted"
                        className="items-center justify-between"
                      >
                        <Field orientation="horizontal">
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
                        </Field>
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
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      disabled={isPending}
                      onClick={() => setDrawerMode("replenish")}
                    >
                      <CookingPot />
                      {messages.pos.menu.replenishKitchenTitle}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Field>
                      <FieldLabel htmlFor="menu-limit-replenish-reason">
                        {messages.pos.menu.replenishKitchenReasonLabel}
                      </FieldLabel>
                      <Textarea
                        id="menu-limit-replenish-reason"
                        data-vaul-no-drag
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
                )}
              </div>
              <DrawerFooter className="flex-row gap-2">
                {drawerMode === "replenish" ? (
                  <Button
                    variant="outline"
                    size="touch"
                    className="flex-1"
                    onClick={() => setDrawerMode("limit")}
                    disabled={isPending}
                  >
                    Quay lại
                  </Button>
                ) : (
                  <>
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
                  </>
                )}
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
