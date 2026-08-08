/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search as IconSearch, ShieldAlert } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
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
import { AppEmptyState } from "@/components/surface";
import { normalizeSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  fetchBranchMenuDailyLimits,
  setBranchMenuDailyLimit,
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

  function applyRowPatch(
    menuItemId: number,
    patch: Partial<Pick<MenuLimitRow, "is_disabled" | "manual_limit_quantity">>,
  ) {
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
          ? `Đã ngưng bán món ${row.item_name}`
          : `Đã mở bán lại món ${row.item_name}`,
      );
      router.refresh();
    });
  }

  function handleSaveLimit(row: MenuLimitRow) {
    const draft = draftQtyById[row.menu_item_id] ?? "";
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-dvh-80 overflow-hidden flex flex-col">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-5 text-warning" />
              {messages.settings.branch.menuLimitsTitle}
            </DrawerTitle>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
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
            </div>
          </div>
          <DrawerDescription>
            Tắt món hết hàng hoặc đặt trần bán trong ngày. POS/KDS cập nhật ngay.
          </DrawerDescription>
          <div className="mt-2">
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
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
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
                const available =
                  row.available_to_sell ?? menuCopy.unlimited;

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
                            Tạm ngưng
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

                    <div className="flex items-end gap-3 border-t pt-2">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
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
                          onBlur={() => handleSaveLimit(row)}
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
                      <div className="flex shrink-0 flex-col items-center gap-1 pb-1">
                        <span className="text-xs text-muted-foreground">Bán</span>
                        <Switch
                          size="touch"
                          checked={!row.is_disabled}
                          disabled={isPending}
                          onCheckedChange={(checked) =>
                            handleToggleDisabled(row, !checked)
                          }
                          aria-label={
                            row.is_disabled
                              ? `Bật món ${row.item_name}`
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
      </DrawerContent>
    </Drawer>
  );
}
