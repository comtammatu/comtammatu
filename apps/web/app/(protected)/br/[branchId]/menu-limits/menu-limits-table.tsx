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
import {
  Progress,
  type ProgressTone,
} from "@comtammatu/ui/components/progress";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "@comtammatu/shared/format";
import { normalizeSearch } from "@lib/search";
import {
  type MenuLimitRow,
  setBranchMenuDailyLimit,
  clearBranchMenuDailyLimit,
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
    qtyText: row.limit_quantity == null ? "" : String(row.limit_quantity),
    isDisabled: row.is_disabled,
  };
}

function isDirty(row: MenuLimitRow, draft: RowDraft): boolean {
  const persisted =
    row.limit_quantity == null ? "" : String(row.limit_quantity);
  return (
    draft.qtyText.trim() !== persisted || draft.isDisabled !== row.is_disabled
  );
}

function isConfigured(row: MenuLimitRow): boolean {
  return (
    row.limit_id !== null || row.limit_quantity !== null || row.is_disabled
  );
}

function getRemaining(row: MenuLimitRow): number | null {
  if (row.limit_quantity == null) return null;
  return Math.max(0, row.limit_quantity - row.sold_today);
}

function getProgress(row: MenuLimitRow): {
  value: number;
  tone: ProgressTone;
  limit: number;
} | null {
  if (row.limit_quantity == null) return null;

  const value = Math.min(
    100,
    Math.round((row.sold_today / row.limit_quantity) * 100),
  );
  if (row.is_disabled) {
    return { value, tone: "destructive", limit: row.limit_quantity };
  }
  if (row.sold_today >= row.limit_quantity) {
    return { value, tone: "warning", limit: row.limit_quantity };
  }
  return { value, tone: "success", limit: row.limit_quantity };
}

function getStatusBadge(row: MenuLimitRow): {
  label: string;
  variant: BadgeProps["variant"];
} {
  const remaining = getRemaining(row);

  if (row.is_disabled) {
    return { label: messages.pos.menu.disabled, variant: "destructive" };
  }
  if (remaining !== null && remaining <= 0) {
    return { label: messages.pos.menu.soldOut, variant: "warning" };
  }
  if (remaining !== null) {
    return {
      label: messages.pos.menu.remaining(remaining),
      variant: "success",
    };
  }
  return { label: messages.pos.menu.unlimited, variant: "outline" };
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
      limited: rows.filter((row) => row.limit_quantity !== null).length,
      disabled: rows.filter((row) => row.is_disabled).length,
      exhausted: rows.filter((row) => {
        const remaining = getRemaining(row);
        return remaining !== null && remaining <= 0 && !row.is_disabled;
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
    let qty: number | null = null;

    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 9999) {
        toast.error("Hạn mức phải là số nguyên từ 1 đến 9999.");
        return;
      }
      qty = parsed;
    }

    const shouldClear = qty === null && !draft.isDisabled;
    const configured = isConfigured(row);

    setPendingId(row.menu_item_id);
    startTransition(async () => {
      try {
        const result =
          shouldClear && configured
            ? await clearBranchMenuDailyLimit({
                branchId,
                menuItemId: row.menu_item_id,
              })
            : await setBranchMenuDailyLimit({
                branchId,
                menuItemId: row.menu_item_id,
                limitQuantity: qty,
                isDisabled: draft.isDisabled,
              });

        if (!result.success) {
          toast.error(result.error ?? "Không lưu được hạn mức.");
          return;
        }

        toast.success(`Đã cập nhật: ${row.item_name}`);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">
                  {messages.pos.menu.itemLabel}
                </TableHead>
                <TableHead className="min-w-44">
                  {messages.pos.menu.statusLabel}
                </TableHead>
                <TableHead className="w-36">
                  {messages.pos.menu.soldLabel}
                </TableHead>
                <TableHead className="w-40">
                  {messages.pos.menu.totalLimitLabel}
                </TableHead>
                <TableHead className="w-24">
                  {messages.pos.menu.toggleDisabled}
                </TableHead>
                <TableHead className="w-32 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((row) => {
                const draft = drafts[row.menu_item_id] ?? buildDraft(row);
                const dirty = isDirty(row, draft);
                const rowPending = isPending && pendingId === row.menu_item_id;
                const status = getStatusBadge(row);
                const progress = getProgress(row);

                return (
                  <TableRow key={row.menu_item_id}>
                    <TableCell>
                      <div className="font-medium">{row.item_name}</div>
                      <div className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatVND(row.base_price)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {progress ? (
                          <Progress
                            value={progress.value}
                            tone={progress.tone}
                            aria-label={messages.pos.menu.soldProgressAria(
                              row.sold_today,
                              progress.limit,
                            )}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm tabular-nums">
                        {row.sold_today}
                        {row.limit_quantity != null
                          ? ` / ${row.limit_quantity}`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell>
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
                        aria-label={messages.pos.menu.totalLimitInputAria(
                          row.item_name,
                        )}
                      />
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AppSection>
      ))}
    </>
  );
}
