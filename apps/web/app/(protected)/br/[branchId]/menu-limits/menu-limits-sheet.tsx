"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getVNDateString } from "@/_lib/format-datetime";
import { messages } from "@lib/messages";
import {
  Save as IconSave,
  Search as IconSearch,
  SlidersHorizontal as IconSliders,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  clearBranchMenuDailyLimit,
  fetchBranchMenuDailyLimits,
  setBranchMenuDailyLimit,
  type MenuLimitRow,
} from "./actions";

interface MenuLimitsSheetProps {
  branchId: number;
  rows: MenuLimitRow[];
  onRowsChange?: (rows: MenuLimitRow[]) => void;
  compact?: boolean;
  triggerLabel?: string;
  triggerTitle?: string;
  sheetTitle?: string;
  sheetDescription?: string;
}

interface RowDraft {
  qtyText: string;
  isDisabled: boolean;
}

function buildDraft(row: MenuLimitRow): RowDraft {
  return {
    qtyText: row.limit_quantity == null ? "" : String(row.limit_quantity),
    isDisabled: row.is_disabled,
  };
}

function isConfigured(row: MenuLimitRow): boolean {
  return (
    row.limit_id !== null || row.limit_quantity !== null || row.is_disabled
  );
}

function isDirty(row: MenuLimitRow, draft: RowDraft): boolean {
  const persistedQty =
    row.limit_quantity == null ? "" : String(row.limit_quantity);
  return (
    draft.qtyText.trim() !== persistedQty ||
    draft.isDisabled !== row.is_disabled
  );
}

function getRemaining(row: MenuLimitRow): number | null {
  if (row.limit_quantity == null) return null;
  return Math.max(0, row.limit_quantity - row.sold_today);
}

export function MenuLimitsSheet({
  branchId,
  rows,
  onRowsChange,
  compact = false,
  triggerLabel = "Hạn mức",
  triggerTitle = "Hạn mức bán hôm nay",
  sheetTitle = "Hạn mức bán hôm nay",
  sheetDescription = "Tắt món hoặc đặt tổng số suất bán trong ngày cho chi nhánh này.",
}: MenuLimitsSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [localRows, setLocalRows] = useState<MenuLimitRow[]>(rows);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>(() =>
    Object.fromEntries(rows.map((row) => [row.menu_item_id, buildDraft(row)])),
  );
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, RowDraft> = {};
      for (const row of localRows) {
        const existing = prev[row.menu_item_id];
        next[row.menu_item_id] =
          existing && isDirty(row, existing) ? existing : buildDraft(row);
      }
      return next;
    });
  }, [localRows]);

  useEffect(() => {
    if (!open) return;

    startRefreshTransition(async () => {
      const result = await fetchBranchMenuDailyLimits(branchId);
      if (!result.success) {
        toast.error(result.error ?? "Không tải được hạn mức bán.");
        return;
      }

      const nextRows = result.data ?? [];
      setLocalRows(nextRows);
      onRowsChange?.(nextRows);
    });
  }, [branchId, onRowsChange, open]);

  const attentionCount = useMemo(
    () =>
      localRows.filter(
        (row) =>
          row.is_disabled ||
          (row.limit_quantity !== null && row.sold_today >= row.limit_quantity),
      ).length,
    [localRows],
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi-VN");
    if (!needle) return localRows;
    return localRows.filter((row) => {
      const label = `${row.item_name} ${row.category_name}`.toLocaleLowerCase(
        "vi-VN",
      );
      return label.includes(needle);
    });
  }, [localRows, query]);

  function updateDraft(menuItemId: number, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [menuItemId]: {
        ...(prev[menuItemId] ?? { qtyText: "", isDisabled: false }),
        ...patch,
      },
    }));
  }

  function replaceRow(menuItemId: number, patch: Partial<MenuLimitRow>): void {
    const nextRows = localRows.map((row) =>
      row.menu_item_id === menuItemId ? { ...row, ...patch } : row,
    );
    setLocalRows(nextRows);
    onRowsChange?.(nextRows);
  }

  function handleSave(row: MenuLimitRow) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const trimmed = draft.qtyText.trim();
    let limitQuantity: number | null = null;

    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 9999) {
        toast.error("Hạn mức phải là số nguyên từ 1 đến 9999.");
        return;
      }
      limitQuantity = parsed;
    }

    const shouldClear = limitQuantity === null && !draft.isDisabled;
    const configured = isConfigured(row);

    setPendingId(row.menu_item_id);
    startSaveTransition(async () => {
      if (shouldClear && configured) {
        const result = await clearBranchMenuDailyLimit({
          branchId,
          menuItemId: row.menu_item_id,
        });
        setPendingId(null);

        if (!result.success) {
          toast.error(result.error ?? "Không lưu được hạn mức.");
          return;
        }

        updateDraft(row.menu_item_id, { qtyText: "", isDisabled: false });
        replaceRow(row.menu_item_id, {
          limit_id: null,
          limit_date: null,
          limit_quantity: null,
          is_disabled: false,
          sold_today: 0,
        });
        toast.success(`Đã cập nhật: ${row.item_name}`);
        router.refresh();
        return;
      }

      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
        limitQuantity,
        isDisabled: draft.isDisabled,
      });
      setPendingId(null);

      if (!result.success) {
        toast.error(result.error ?? "Không lưu được hạn mức.");
        return;
      }
      if (!result.data) {
        toast.error("Không lưu được hạn mức.");
        return;
      }

      replaceRow(row.menu_item_id, {
        limit_id: row.limit_id ?? row.menu_item_id,
        limit_date: row.limit_date ?? getVNDateString(),
        limit_quantity: result.data.limit_quantity,
        is_disabled: result.data.is_disabled,
        sold_today: result.data.sold_today,
      });
      toast.success(`Đã cập nhật: ${row.item_name}`);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={attentionCount > 0 ? "secondary" : "ghost"}
          size={compact ? "icon-sm" : "sm"}
          className={cn(compact && "relative", !compact && "gap-1.5")}
          aria-label={triggerTitle}
          title={triggerTitle}
        >
          <IconSliders
            data-icon={compact ? undefined : "inline-start"}
            aria-hidden
          />
          {compact ? null : triggerLabel}
          {attentionCount > 0 ? (
            <Badge
              variant="warning"
              className={cn(
                "rounded-full px-1.5 py-0",
                compact ? "absolute -right-1 -top-1" : "ml-1",
              )}
            >
              {attentionCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader className="border-b px-4 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle>{sheetTitle}</SheetTitle>
            {isRefreshing ? <Spinner aria-hidden /> : null}
          </div>
          <SheetDescription>{sheetDescription}</SheetDescription>
        </SheetHeader>

        <div className="border-b px-4 py-3">
          <div className="flex h-9 items-center gap-2 border bg-background px-2">
            <IconSearch className="text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={messages.pos.menu.searchPlaceholder}
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {filteredRows.map((row) => {
              const draft = drafts[row.menu_item_id] ?? buildDraft(row);
              const dirty = isDirty(row, draft);
              const remaining = getRemaining(row);
              const exhausted = remaining !== null && remaining === 0;
              const rowPending = isSaving && pendingId === row.menu_item_id;

              return (
                <section
                  key={row.menu_item_id}
                  className={cn(
                    "rounded-md border bg-card p-3",
                    row.is_disabled && "border-destructive/40 bg-destructive/5",
                    exhausted &&
                      !row.is_disabled &&
                      "border-warning/50 bg-warning/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 font-heading text-sm font-semibold leading-snug">
                        {row.item_name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.category_name}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {row.is_disabled ? (
                        <Badge variant="destructive">
                          {messages.pos.menu.disabled}
                        </Badge>
                      ) : exhausted ? (
                        <Badge variant="warning">
                          {messages.pos.menu.soldOut}
                        </Badge>
                      ) : remaining !== null ? (
                        <Badge variant="outline">
                          {messages.pos.menu.remaining(remaining)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {messages.pos.menu.unlimited}
                        </Badge>
                      )}
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {messages.pos.menu.soldCount(row.sold_today)}
                        {row.limit_quantity !== null
                          ? ` / ${row.limit_quantity}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={9999}
                        inputMode="numeric"
                        placeholder={messages.pos.menu.unlimited}
                        value={draft.qtyText}
                        disabled={rowPending}
                        onChange={(event) =>
                          updateDraft(row.menu_item_id, {
                            qtyText: event.target.value,
                          })
                        }
                        aria-label={messages.pos.menu.limitInputAria(
                          row.item_name,
                        )}
                      />
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        {messages.pos.menu.toggleDisabled}
                        <Switch
                          checked={draft.isDisabled}
                          disabled={rowPending}
                          onCheckedChange={(checked) =>
                            updateDraft(row.menu_item_id, {
                              isDisabled: checked,
                            })
                          }
                          aria-label={messages.pos.menu.disableItemAria(
                            row.item_name,
                          )}
                        />
                      </label>
                    </div>

                    <div className="flex justify-end gap-2">
                      {dirty ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={rowPending}
                          onClick={() => handleSave(row)}
                        >
                          {rowPending ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <IconSave data-icon="inline-start" aria-hidden />
                          )}
                          {messages.pos.menu.updateLimit}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            })}

            {filteredRows.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {messages.pos.menu.noResults}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
