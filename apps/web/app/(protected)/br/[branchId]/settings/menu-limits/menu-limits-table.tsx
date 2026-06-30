"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save as IconSave, Search as IconSearch } from "lucide-react";
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
import { type MenuLimitRow, setBranchMenuDailyLimit } from "./actions";
import { messages } from "@lib/messages";

interface Props {
  branchId: number;
  rows: MenuLimitRow[];
}

interface RowDraft {
  qtyText: string;
  isDisabled: boolean;
}

function getDraftLimitQuantity(row: MenuLimitRow): number | null {
  return row.limit_quantity ?? row.stock_capacity;
}

function buildDraft(row: MenuLimitRow): RowDraft {
  const limitQuantity = getDraftLimitQuantity(row);
  return {
    qtyText: limitQuantity == null ? "" : String(limitQuantity),
    isDisabled: row.is_disabled,
  };
}

function isDirty(row: MenuLimitRow, draft: RowDraft): boolean {
  const persisted = String(getDraftLimitQuantity(row) ?? "");
  return (
    draft.qtyText.trim() !== persisted || draft.isDisabled !== row.is_disabled
  );
}

function getSoldProgress(row: MenuLimitRow): {
  limit: number;
  sold: number;
  remaining: number;
  value: number;
} | null {
  const limit = getDraftLimitQuantity(row);
  if (limit == null) return null;

  const sold = Math.max(0, row.sold_today);
  const remaining = Math.max(0, limit - sold);
  const value =
    limit <= 0
      ? sold > 0
        ? 100
        : 0
      : Math.min(100, Math.round((sold / limit) * 100));

  return { limit, sold, remaining, value };
}

function getItemBadge(row: MenuLimitRow): {
  label: string;
  variant: BadgeProps["variant"];
} | null {
  if (row.is_disabled) {
    return { label: messages.pos.menu.disabled, variant: "destructive" };
  }

  const progress = getSoldProgress(row);
  if (progress !== null && progress.remaining <= 0) {
    return { label: messages.pos.menu.soldOut, variant: "warning" };
  }

  return null;
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

    return Array.from(map.values());
  }, [query, rows]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      limited: rows.filter((row) => getDraftLimitQuantity(row) !== null).length,
      stockLimited: rows.filter((row) => row.stock_capacity !== null).length,
      disabled: rows.filter((row) => row.is_disabled).length,
      exhausted: rows.filter((row) => {
        const progress = getSoldProgress(row);
        return progress !== null && progress.remaining <= 0 && !row.is_disabled;
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

    if (trimmed === "") {
      toast.error(messages.pos.menu.manualLimitRequired);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
      toast.error(messages.pos.menu.manualLimitRange);
      return;
    }
    if (row.stock_capacity === null) {
      toast.error(messages.pos.menu.stockCapacityRequired);
      return;
    }
    if (parsed > row.stock_capacity) {
      toast.error(
        messages.pos.menu.manualLimitExceedsStock(row.stock_capacity),
      );
      return;
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
          toast.error(result.error ?? "Không lưu được giới hạn bán.");
          return;
        }

        toast.success(`Đã cập nhật: ${row.item_name}`);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function renderSaveButton(row: MenuLimitRow) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const dirty = isDirty(row, draft);
    const rowPending = isPending && pendingId === row.menu_item_id;
    if (!dirty) return null;
    return (
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
          {messages.pos.menu.remainingUnavailable}
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
            progress.limit,
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
        max={row.stock_capacity ?? 9999}
        inputMode="numeric"
        placeholder={messages.pos.menu.manualLimitPlaceholder}
        required
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

  function renderDisabledSwitch(row: MenuLimitRow) {
    const draft = drafts[row.menu_item_id] ?? buildDraft(row);
    const rowPending = isPending && pendingId === row.menu_item_id;
    return (
      <Switch
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

  function renderLimitControls(row: MenuLimitRow) {
    return (
      <div className="flex flex-col gap-2">
        {renderLimitInput(row)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {renderDisabledSwitch(row)}
            {messages.pos.menu.toggleDisabled}
          </div>
          {renderSaveButton(row)}
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
        const badge = getItemBadge(row);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.item_name}</span>
              {badge ? (
                <Badge variant={badge.variant}>{badge.label}</Badge>
              ) : null}
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
        <Button asChild variant="outline" size="sm">
          <Link href="/menu">{messages.pos.menu.openMenu}</Link>
        </Button>
      </AppEmptyState>
    );
  }

  return (
    <>
      <AppToolbar
        search={
          <InputGroup className="h-9 w-full sm:w-80">
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
            mobileCardRender={(row) => (
              <Item variant="outline">
                <ItemHeader>
                  <ItemContent>
                    <ItemTitle>
                      {row.item_name}
                      {(() => {
                        const badge = getItemBadge(row);
                        return badge ? (
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        ) : null;
                      })()}
                    </ItemTitle>
                    <ItemDescription>
                      {formatVND(row.base_price)}
                    </ItemDescription>
                    <ItemDescription>
                      {messages.pos.menu.stockCapacityLabel}:{" "}
                      {renderStockCapacity(row)}
                    </ItemDescription>
                  </ItemContent>
                </ItemHeader>
                {renderRemainingBar(row)}
                <ItemFooter>
                  <span className="text-sm text-muted-foreground">
                    {messages.pos.menu.manualLimitLabel}
                  </span>
                  <div className="w-40">{renderLimitControls(row)}</div>
                </ItemFooter>
              </Item>
            )}
          />
        </AppSection>
      ))}
    </>
  );
}
