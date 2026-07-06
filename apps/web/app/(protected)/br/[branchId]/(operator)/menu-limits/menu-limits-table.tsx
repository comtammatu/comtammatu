"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save as IconSave,
  Search as IconSearch,
  X as IconX,
} from "lucide-react";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
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
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { normalizeSearch } from "@lib/search";
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

interface RowDraft {
  qtyText: string;
  isDisabled: boolean;
}

function buildDraft(row: MenuLimitRow): RowDraft {
  return {
    qtyText:
      row.manual_limit_quantity == null
        ? ""
        : String(row.manual_limit_quantity),
    isDisabled: row.is_disabled,
  };
}

function isDirty(row: MenuLimitRow, draft: RowDraft): boolean {
  const persisted = row.manual_limit_quantity == null
    ? ""
    : String(row.manual_limit_quantity);
  return (
    draft.qtyText.trim() !== persisted || draft.isDisabled !== row.is_disabled
  );
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

  if (row.stock_capacity === null) {
    return { label: messages.pos.menu.noStockConfig, variant: "outline" };
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

export function MenuLimitsTable({ branchId, rows }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>(() =>
    Object.fromEntries(rows.map((row) => [row.menu_item_id, buildDraft(row)])),
  );
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

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
      limited: rows.filter((row) => row.manual_limit_quantity !== null)
        .length,
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

  function updateDraft(id: number, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { qtyText: "", isDisabled: false }), ...patch },
    }));
  }

  function handleSave(row: MenuLimitRow) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const trimmed = draft.qtyText.trim();

    let parsed: number | null = null;
    if (trimmed !== "") {
      parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
        toast.error(messages.pos.menu.manualLimitRange);
        return;
      }
    }

    setPendingId(row.menu_item_id);
    startTransition(async () => {
      try {
        const result = await setBranchMenuDailyLimit({
          branchId,
          menuItemId: row.menu_item_id,
          limitQuantity: parsed,
          isDisabled: draft.isDisabled,
        });

        if (!result.success) {
          toast.error(result.error ?? messages.pos.menu.saveLimitFailed);
          return;
        }

        toast.success(messages.pos.menu.limitUpdated(row.item_name));
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleClear(row: MenuLimitRow) {
    setPendingId(row.menu_item_id);
    startTransition(async () => {
      try {
        const result = await clearBranchMenuDailyLimit({
          branchId,
          menuItemId: row.menu_item_id,
        });

        if (!result.success) {
          toast.error(result.error ?? messages.pos.menu.clearLimitFailed);
          return;
        }

        toast.success(messages.pos.menu.limitUpdated(row.item_name));
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function renderSaveButton(row: MenuLimitRow, touch = false) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const dirty = isDirty(row, draft);
    const rowPending = isPending && pendingId === row.menu_item_id;
    if (!dirty) return null;
    return (
      <Button
        type="button"
        size={touch ? "touch" : "sm"}
        className={touch ? "w-full" : undefined}
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
    );
  }

  function renderClearButton(row: MenuLimitRow, touch = false) {
    if (row.manual_limit_quantity === null) return null;
    const rowPending = isPending && pendingId === row.menu_item_id;
    return (
      <Button
        type="button"
        variant="outline"
        size={touch ? "touch" : "sm"}
        className={touch ? "w-full" : undefined}
        disabled={rowPending}
        onClick={() => handleClear(row)}
        aria-label={messages.pos.menu.clearLimitAria(row.item_name)}
      >
        {rowPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconX data-icon="inline-start" aria-hidden />
        )}
        {messages.pos.menu.clearLimit}
      </Button>
    );
  }

  function renderStockCapacity(row: MenuLimitRow) {
    return row.stock_capacity == null ? (
      <span className="text-muted-foreground">
        {messages.pos.menu.stockCapacityEmpty}
      </span>
    ) : (
      <span className="font-mono text-sm tabular-nums">
        {row.stock_capacity}
      </span>
    );
  }

  function renderRemainingBar(row: MenuLimitRow) {
    const progress = getSoldProgress(row);
    if (progress === null) {
      return (
        <span className="text-xs text-muted-foreground">
          {messages.pos.menu.unlimited}
        </span>
      );
    }

    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
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
          aria-label={messages.pos.menu.soldProgressAria(
            progress.sold,
            progress.sold + progress.remaining,
          )}
        />
      </div>
    );
  }

  function renderLimitInput(row: MenuLimitRow) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const rowPending = isPending && pendingId === row.menu_item_id;
    return (
      <Input
        type="number"
        min={0}
        max={9999}
        inputMode="numeric"
        placeholder={messages.pos.menu.manualLimitPlaceholder}
        value={draft.qtyText}
        disabled={rowPending}
        onChange={(event) =>
          updateDraft(row.menu_item_id, {
            qtyText: event.target.value,
          })
        }
        aria-label={messages.pos.menu.manualLimitInputAria(row.item_name)}
      />
    );
  }

  function renderDisabledSwitch(row: MenuLimitRow, touch = false) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const rowPending = isPending && pendingId === row.menu_item_id;
    return (
      <Switch
        size={touch ? "touch" : "default"}
        checked={draft.isDisabled}
        disabled={rowPending}
        onCheckedChange={(checked) =>
          updateDraft(row.menu_item_id, {
            isDisabled: checked,
          })
        }
        aria-label={messages.pos.menu.disableItemAria(row.item_name)}
      />
    );
  }

  function renderLimitControls(row: MenuLimitRow, touch = false) {
    return (
      <div className="flex flex-col gap-2">
        {renderLimitInput(row)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {renderDisabledSwitch(row, touch)}
            {messages.pos.menu.toggleDisabled}
          </div>
          <div className="flex items-center gap-2">
            {renderClearButton(row, touch)}
            {renderSaveButton(row, touch)}
          </div>
        </div>
      </div>
    );
  }

  const columns: DataTableColumn<MenuLimitRow>[] = [
    {
      key: "item",
      header: messages.pos.menu.itemLabel,
      className: "min-w-56",
      render: (row) => {
        return (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.item_name}</span>
              {renderItemBadge(row)}
            </div>
            <div className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatVND(row.base_price)}
            </div>
          </div>
        );
      },
    },
    {
      key: "stockCapacity",
      header: messages.pos.menu.stockCapacityLabel,
      className: "w-36",
      render: (row) => renderStockCapacity(row),
    },
    {
      key: "limit",
      header: messages.pos.menu.manualLimitLabel,
      className: "w-56",
      render: (row) => renderLimitControls(row),
    },
    {
      key: "remaining",
      header: messages.pos.menu.soldLabel,
      className: "min-w-56",
      render: (row) => renderRemainingBar(row),
    },
  ];

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
          <>
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
          </>
        }
      />

      {grouped.length === 0 ? (
        <AppEmptyState title={messages.pos.menu.noResults} compact />
      ) : null}

      {grouped.map((group) => (
        <AppSection
          key={group.categoryId}
          title={group.categoryName}
          badge={{
            children: messages.pos.menu.itemCount(group.items.length),
            variant: "outline",
          }}
          contentFlush
          contentScroll
        >
          <DataTable
            columns={columns}
            data={group.items}
            getRowKey={(row) => row.menu_item_id}
            mobileBreakpoint={1024}
            mobileCardRender={(row) => (
              <Item variant="outline" className="items-stretch gap-3">
                <ItemHeader className="items-start">
                  <ItemContent className="min-w-0 gap-1">
                    <ItemTitle className="line-clamp-2 w-full flex-wrap text-sm">
                      <span className="min-w-0">{row.item_name}</span>
                      {renderItemBadge(row)}
                    </ItemTitle>
                    <ItemDescription className="flex flex-wrap items-center gap-2">
                      <span className="font-mono tabular-nums text-foreground">
                        {formatVND(row.base_price)}
                      </span>
                      <span>
                        {messages.pos.menu.stockCapacityLabel}:{" "}
                        {renderStockCapacity(row)}
                      </span>
                    </ItemDescription>
                  </ItemContent>
                </ItemHeader>
                <div className="basis-full rounded-md bg-muted/30 p-2">
                  {renderRemainingBar(row)}
                </div>
                <ItemFooter className="flex-col items-stretch gap-2 border-t pt-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {messages.pos.menu.manualLimitLabel}
                  </span>
                  {renderLimitControls(row, true)}
                </ItemFooter>
              </Item>
            )}
          />
        </AppSection>
      ))}
    </>
  );
}
