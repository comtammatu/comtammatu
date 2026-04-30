"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RotateCcw as IconReset,
  Save as IconSave,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
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
import {
  type MenuLimitRow,
  setBranchMenuDailyLimit,
  clearBranchMenuDailyLimit,
} from "./actions";

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
  const persisted = row.limit_quantity == null ? "" : String(row.limit_quantity);
  return draft.qtyText.trim() !== persisted || draft.isDisabled !== row.is_disabled;
}

function isConfigured(row: MenuLimitRow): boolean {
  return row.limit_id !== null;
}

export function MenuLimitsTable({ branchId, rows }: Props) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>(() =>
    Object.fromEntries(rows.map((r) => [r.menu_item_id, buildDraft(r)])),
  );
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<
      number,
      { categoryId: number; categoryName: string; items: MenuLimitRow[] }
    >();
    for (const r of rows) {
      const existing = map.get(r.category_id);
      if (existing) {
        existing.items.push(r);
      } else {
        map.set(r.category_id, {
          categoryId: r.category_id,
          categoryName: r.category_name,
          items: [r],
        });
      }
    }
    return Array.from(map.values());
  }, [rows]);

  function updateDraft(id: number, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { qtyText: "", isDisabled: false }), ...patch },
    }));
  }

  function handleSave(row: MenuLimitRow) {
    const draft = drafts[row.menu_item_id];
    if (!draft) return;

    const trimmed = draft.qtyText.trim();
    let qty: number | null = null;
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        toast.error("Số lượng phải là số nguyên dương");
        return;
      }
      qty = parsed;
    }

    setPendingId(row.menu_item_id);
    startTransition(async () => {
      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
        limitQuantity: qty,
        isDisabled: draft.isDisabled,
      });
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Không lưu được hạn mức");
        return;
      }
      toast.success(`Đã cập nhật: ${row.item_name}`);
      router.refresh();
    });
  }

  function handleClear(row: MenuLimitRow) {
    setPendingId(row.menu_item_id);
    startTransition(async () => {
      const result = await clearBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
      });
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Không bỏ được hạn mức");
        return;
      }
      // Reset draft back to "no limit, not disabled".
      updateDraft(row.menu_item_id, { qtyText: "", isDisabled: false });
      toast.success(`Đã bỏ hạn mức: ${row.item_name}`);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
        Chưa có món nào trong thực đơn. Hãy{" "}
        <Link className="underline" href="/menu">
          thêm món
        </Link>{" "}
        trước khi cấu hình hạn mức bán.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <section
          key={group.categoryId}
          className="rounded-md border bg-card"
          aria-label={group.categoryName}
        >
          <div className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">
            {group.categoryName}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">Món</TableHead>
                <TableHead className="hidden md:table-cell">Đã bán</TableHead>
                <TableHead className="w-32">Hạn mức (suất)</TableHead>
                <TableHead className="w-24">Tắt món</TableHead>
                <TableHead className="w-48 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((row) => {
                const draft = drafts[row.menu_item_id] ?? buildDraft(row);
                const dirty = isDirty(row, draft);
                const configured = isConfigured(row);
                const exhausted =
                  row.limit_quantity != null &&
                  row.sold_today >= row.limit_quantity;
                const rowPending =
                  isPending && pendingId === row.menu_item_id;
                return (
                  <TableRow key={row.menu_item_id}>
                    <TableCell>
                      <div className="font-medium">{row.item_name}</div>
                      {row.is_disabled ? (
                        <Badge
                          variant="destructive"
                          className="mt-1 text-xs"
                        >
                          Đang tắt
                        </Badge>
                      ) : exhausted ? (
                        <Badge
                          variant="warning"
                          className="mt-1 text-xs"
                        >
                          Hết suất hôm nay
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="tabular-nums text-sm">
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
                        placeholder="Không giới hạn"
                        value={draft.qtyText}
                        disabled={rowPending}
                        onChange={(e) =>
                          updateDraft(row.menu_item_id, {
                            qtyText: e.target.value,
                          })
                        }
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
                        aria-label={`Tắt món ${row.item_name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {configured ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={rowPending}
                            onClick={() => handleClear(row)}
                          >
                            <IconReset className="size-4" />
                            Bỏ hạn mức
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          disabled={rowPending || !dirty}
                          onClick={() => handleSave(row)}
                        >
                          <IconSave className="size-4" />
                          Lưu
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
