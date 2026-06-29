"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { ORDER_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  CheckCheck as IconCheckCheck,
  History as IconHistory,
  RefreshCcw as IconRefresh,
} from "lucide-react";
import { fetchKdsCompletionHistory } from "../actions";
import type { KdsCompletionHistoryEntry } from "../_lib/completion-history";

const KDS_COMPLETION_HISTORY_LIMIT = 50;
const KDS_COMPLETION_HISTORY_COPY = {
  title: "Lịch sử hoàn thành",
  description: "Các phiếu bếp đã bấm xong hôm nay.",
  sourceTitle: "Đã hoàn thành",
  reload: "Tải lại",
  loading: "Đang tải lịch sử hoàn thành...",
  empty: "Chưa có phiếu bếp nào hoàn thành hôm nay.",
  loadError: "Không thể tải lịch sử hoàn thành.",
  done: "Đã xong",
  itemUnit: "món",
  portionUnit: "phần",
  moreItems: (count: number) => `+${String(count)} món khác`,
  fallbackItem: "Chưa tải được chi tiết món",
} as const;

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: ORDER_TYPE_LABELS_VI.dine_in,
  takeaway: ORDER_TYPE_LABELS_VI.takeaway,
  delivery: "Giao hàng",
} as const;

function getEntryContext(entry: KdsCompletionHistoryEntry): string {
  const orderType = ORDER_TYPE_LABELS[entry.orderType] ?? entry.orderType;
  const table = entry.tableNumber === null ? null : `Bàn ${entry.tableNumber}`;
  return [orderType, table, `Đơn #${entry.orderNumber}`]
    .filter(Boolean)
    .join(" · ");
}

function getItemPreview(entry: KdsCompletionHistoryEntry): string[] {
  if (entry.items.length === 0) {
    return [KDS_COMPLETION_HISTORY_COPY.fallbackItem];
  }

  const visibleItems = entry.items
    .slice(0, 4)
    .map((item) => `${String(item.quantity)}× ${item.name}`);
  const hiddenCount = entry.items.length - visibleItems.length;
  return hiddenCount > 0
    ? [...visibleItems, KDS_COMPLETION_HISTORY_COPY.moreItems(hiddenCount)]
    : visibleItems;
}

interface KdsCompletionHistorySheetProps {
  branchId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KdsCompletionHistorySheet({
  branchId,
  open,
  onOpenChange,
}: KdsCompletionHistorySheetProps) {
  const [history, setHistory] = useState<KdsCompletionHistoryEntry[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadHistory = useCallback(() => {
    startTransition(async () => {
      const result = await fetchKdsCompletionHistory({
        branchId,
        limit: KDS_COMPLETION_HISTORY_LIMIT,
      });
      if (result.success && result.data) {
        setHistory(result.data);
        setError(null);
        return;
      }
      setHistory([]);
      setError(result.error ?? KDS_COMPLETION_HISTORY_COPY.loadError);
    });
  }, [branchId]);

  useEffect(() => {
    if (!open) {
      setHistory(null);
      setError(null);
      return;
    }
    setHistory(null);
    setError(null);
    loadHistory();
  }, [loadHistory, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden sm:max-w-xl">
        <SheetHeader>
          <div className="flex min-w-0 items-start gap-2">
            <IconHistory
              data-icon="inline-start"
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <SheetTitle>{KDS_COMPLETION_HISTORY_COPY.title}</SheetTitle>
              <SheetDescription>
                {KDS_COMPLETION_HISTORY_COPY.description}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex items-center justify-between gap-2 border-y px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {KDS_COMPLETION_HISTORY_COPY.sourceTitle}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={loadHistory}
          >
            {isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconRefresh data-icon="inline-start" aria-hidden />
            )}
            {KDS_COMPLETION_HISTORY_COPY.reload}
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-4">
            {isPending && history === null && (
              <div className="rounded-md border px-4 py-4 text-center text-sm text-muted-foreground">
                {KDS_COMPLETION_HISTORY_COPY.loading}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {!isPending && !error && history !== null && history.length === 0 && (
              <div className="rounded-md border px-4 py-4 text-center text-sm text-muted-foreground">
                {KDS_COMPLETION_HISTORY_COPY.empty}
              </div>
            )}

            {history?.map((entry) => (
              <article
                key={entry.groupKey}
                className="rounded-md border bg-card p-3 text-sm"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-semibold leading-6">
                      {entry.kitchenTicketNumber}
                    </p>
                    <p className="min-w-0 break-words text-xs text-muted-foreground">
                      {getEntryContext(entry)}
                    </p>
                  </div>
                  <Badge variant="success" className="shrink-0">
                    <IconCheckCheck data-icon="inline-start" aria-hidden />
                    {KDS_COMPLETION_HISTORY_COPY.done}
                  </Badge>
                </div>

                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  <time className="font-mono text-xs text-muted-foreground">
                    {formatVNDateTime(entry.completedAt)}
                  </time>
                  <Badge variant="outline">
                    {entry.itemCount} {KDS_COMPLETION_HISTORY_COPY.itemUnit}
                  </Badge>
                  <Badge variant="outline">
                    {entry.itemQuantity}{" "}
                    {KDS_COMPLETION_HISTORY_COPY.portionUnit}
                  </Badge>
                </div>

                <ul className="mt-2 flex flex-col gap-1 text-sm leading-5">
                  {getItemPreview(entry).map((item, index) => (
                    <li key={index} className="min-w-0 break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
