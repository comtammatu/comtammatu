"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search as IconSearch, ShieldAlert } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Badge } from "@comtammatu/ui/components/badge";
import { Switch } from "@comtammatu/ui/components/switch";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppEmptyState, AppDrawer } from "@/components/surface";
import { normalizeSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  fetchBranchMenuDailyLimits,
  setBranchMenuDailyLimit,
  setBranchMenuStockAllowanceEnabled,
  type MenuLimitRow,
} from "../../menu-limits/actions";

const menuCopy = messages.pos.menu;

interface Props {
  branchId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function draftFromRows(rows: MenuLimitRow[]): Record<number, string> {
  const next: Record<number, string> = {};
  for (const row of rows) {
    next[row.menu_item_id] =
      row.manual_limit_quantity == null
        ? ""
        : String(row.manual_limit_quantity);
  }
  return next;
}

function parseLimitDraft(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
    return "invalid";
  }
  return parsed;
}

function isAllowanceEnabled(row: MenuLimitRow): boolean {
  return (row.stock_allowance_quantity ?? 0) > 0;
}

export function BranchQuickMenuLimitSheet({
  branchId,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MenuLimitRow[]>([]);
  const [draftQtyById, setDraftQtyById] = useState<Record<number, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);
    fetchBranchMenuDailyLimits(branchId).then((res) => {
      if (!mounted) return;
      setLoading(false);
      if (res.success && res.data) {
        setRows(res.data);
        setDraftQtyById(draftFromRows(res.data));
      } else {
        toast.error(res.error ?? menuCopy.loadMenuLimitsFailed);
      }
    });

    return () => {
      mounted = false;
    };
  }, [open, branchId]);

  const filteredRows = rows.filter((row) => {
    if (!query.trim()) return true;
    const needle = normalizeSearch(query).trim();
    const haystack = normalizeSearch(`${row.item_name} ${row.category_name}`);
    return haystack.includes(needle);
  });

  const disabledCount = rows.filter((r) => r.is_disabled).length;
  const limitedCount = rows.filter(
    (r) => r.manual_limit_quantity !== null,
  ).length;

  function applyRowPatch(menuItemId: number, patch: Partial<MenuLimitRow>) {
    setRows((prev) =>
      prev.map((item) =>
        item.menu_item_id === menuItemId ? { ...item, ...patch } : item,
      ),
    );
  }

  function handleToggleDisabled(row: MenuLimitRow, isDisabled: boolean) {
    startTransition(async () => {
      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
        limitQuantity: row.manual_limit_quantity,
        isDisabled,
      });

      if (!result.success) {
        toast.error(result.error ?? menuCopy.saveLimitFailed);
        return;
      }

      applyRowPatch(row.menu_item_id, { is_disabled: isDisabled });
      toast.success(
        isDisabled
          ? menuCopy.itemPaused(row.item_name)
          : menuCopy.itemResumed(row.item_name),
      );
      router.refresh();
    });
  }

  function handleToggleAllowance(row: MenuLimitRow, enabled: boolean) {
    startTransition(async () => {
      const result = await setBranchMenuStockAllowanceEnabled({
        branchId,
        menuItemId: row.menu_item_id,
        enabled,
      });

      if (!result.success || !result.data) {
        toast.error(result.error ?? menuCopy.stockAllowanceSaveFailed);
        return;
      }

      applyRowPatch(row.menu_item_id, {
        stock_allowance_quantity: result.data.stock_allowance_quantity,
      });
      toast.success(
        enabled
          ? menuCopy.stockAllowanceUpdated(row.item_name)
          : menuCopy.stockAllowanceCleared(row.item_name),
      );
      router.refresh();
    });
  }

  function handleSaveLimit(row: MenuLimitRow, draftValue?: string) {
    const draft = draftValue ?? draftQtyById[row.menu_item_id] ?? "";
    const parsed = parseLimitDraft(draft);
    if (parsed === "invalid") {
      toast.error(menuCopy.manualLimitRange);
      return;
    }
    if (parsed === row.manual_limit_quantity) return;

    startTransition(async () => {
      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
        limitQuantity: parsed,
        isDisabled: row.is_disabled,
      });

      if (!result.success) {
        toast.error(result.error ?? menuCopy.saveLimitFailed);
        return;
      }

      applyRowPatch(row.menu_item_id, { manual_limit_quantity: parsed });
      setDraftQtyById((prev) => ({
        ...prev,
        [row.menu_item_id]: parsed == null ? "" : String(parsed),
      }));
      toast.success(menuCopy.limitUpdated(row.item_name));
      router.refresh();
    });
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-5 text-warning" />
          {messages.settings.branch.menuLimitsTitle}
          <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
            {disabledCount > 0 ? (
              <Badge variant="destructive">
                {menuCopy.disabledCount(disabledCount)}
              </Badge>
            ) : null}
            {limitedCount > 0 ? (
              <Badge variant="secondary">
                {menuCopy.limitedCount(limitedCount)}
              </Badge>
            ) : null}
          </span>
        </span>
      }
      description={menuCopy.drawerDescription}
      contentClassName="max-h-dvh-80 overflow-hidden flex flex-col"
      headerClassName="shrink-0 border-b"
    >
      <div className="mb-2">
        <InputGroup className="w-full">
          <InputGroupAddon>
            <IconSearch className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={menuCopy.searchPlaceholder}
            aria-label={menuCopy.searchAria}
          />
        </InputGroup>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <AppEmptyState
            title={menuCopy.noResults}
            compact
            symbol="roundPlate"
          />
        ) : (
          <ItemGroup className="gap-2 p-2">
            {filteredRows.map((row) => {
              const draftQty = draftQtyById[row.menu_item_id] ?? "";
              const available = row.available_to_sell ?? menuCopy.unlimited;
              const allowanceOn = isAllowanceEnabled(row);

              return (
                <Item
                  key={row.menu_item_id}
                  variant="outline"
                  size="sm"
                  className="flex-col items-stretch gap-2 bg-card"
                >
                  <ItemContent className="min-w-0 gap-1">
                    <ItemTitle className="flex items-center gap-2 text-sm font-medium">
                      <span className="min-w-0 flex-1 truncate">
                        {row.item_name}
                      </span>
                      {row.is_disabled ? (
                        <Badge variant="destructive" className="shrink-0">
                          {menuCopy.pausedBadge}
                        </Badge>
                      ) : null}
                      {allowanceOn ? (
                        <Badge variant="secondary" className="shrink-0">
                          {menuCopy.allowanceBadge}
                        </Badge>
                      ) : null}
                    </ItemTitle>
                    <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span>{row.category_name}</span>
                      <span aria-hidden>•</span>
                      <span>
                        {menuCopy.availableToSellLabel}:{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {available}
                        </span>
                      </span>
                      {row.sold_today > 0 ? (
                        <>
                          <span aria-hidden>•</span>
                          <span>
                            {menuCopy.soldTodayLabel}:{" "}
                            <span className="font-mono tabular-nums text-foreground">
                              {row.sold_today}
                            </span>
                          </span>
                        </>
                      ) : null}
                    </ItemDescription>
                  </ItemContent>

                  <div className="flex flex-col gap-2 border-t pt-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        {menuCopy.manualLimitShortLabel}
                      </span>
                      <QuantityInput
                        maxFractionDigits={0}
                        max={9999}
                        placeholder={menuCopy.manualLimitPlaceholder}
                        value={draftQty}
                        disabled={isPending}
                        onValueChange={(next) =>
                          setDraftQtyById((prev) => ({
                            ...prev,
                            [row.menu_item_id]: next,
                          }))
                        }
                        onValueBlur={(next) => {
                          setDraftQtyById((prev) => ({
                            ...prev,
                            [row.menu_item_id]: next,
                          }));
                          handleSaveLimit(row, next);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        aria-label={menuCopy.manualLimitInputAria(
                          row.item_name,
                        )}
                        className="min-h-12"
                      />
                    </label>
                    <div className="flex min-h-12 items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {menuCopy.stockAllowanceLabel}
                      </span>
                      <Switch
                        size="touch"
                        checked={allowanceOn}
                        disabled={isPending}
                        onCheckedChange={(checked) =>
                          handleToggleAllowance(row, checked)
                        }
                        aria-label={menuCopy.stockAllowanceAria(row.item_name)}
                      />
                    </div>
                    <div className="flex min-h-12 items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {menuCopy.sellingSwitchLabel}
                      </span>
                      <Switch
                        size="touch"
                        checked={!row.is_disabled}
                        disabled={isPending}
                        onCheckedChange={(checked) =>
                          handleToggleDisabled(row, !checked)
                        }
                        aria-label={
                          row.is_disabled
                            ? menuCopy.enableItemAria(row.item_name)
                            : menuCopy.disableItemAria(row.item_name)
                        }
                      />
                    </div>
                  </div>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </div>
    </AppDrawer>
  );
}
