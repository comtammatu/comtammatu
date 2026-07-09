"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { ORDER_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { KDS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Alert,
  AlertDescription,
} from "@comtammatu/ui/components/alert";
import {
  Item,
  ItemContent,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppEmptyState } from "@/components/surface";
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
      setError(result.error ?? KDS_VI.completionHistoryLoadFailed);
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
          <SectionLabel>
            {KDS_COMPLETION_HISTORY_COPY.sourceTitle}
          </SectionLabel>
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
              <Item
                variant="outline"
                className="justify-center px-4 py-4 text-center text-sm text-muted-foreground"
                aria-live="polite"
              >
                <Spinner data-icon="inline-start" />
                <ItemContent className="flex-none">
                  {KDS_VI.completionHistoryLoading}
                </ItemContent>
              </Item>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isPending && !error && history !== null && history.length === 0 && (
              <AppEmptyState
                compact
                title={KDS_VI.completionHistoryEmpty}
              />
            )}

            {history && history.length > 0 && (
              <ItemGroup>
                {history.map((entry) => (
                  <Item
                    asChild
                    key={entry.groupKey}
                    role="listitem"
                    variant="outline"
                    className="items-start bg-card p-3 text-sm"
                  >
                    <article>
                      <ItemContent>
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-base leading-6 font-semibold">
                              {entry.kitchenTicketNumber}
                            </p>
                            <p className="min-w-0 break-words text-xs text-muted-foreground">
                              {getEntryContext(entry)}
                            </p>
                          </div>
                          <Badge variant="success" className="shrink-0">
                            <IconCheckCheck
                              data-icon="inline-start"
                              aria-hidden
                            />
                            {KDS_COMPLETION_HISTORY_COPY.done}
                          </Badge>
                        </div>

                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                          <time className="font-mono text-xs text-muted-foreground">
                            {formatVNDateTime(entry.completedAt)}
                          </time>
                          <Badge variant="outline">
                            {entry.itemCount}{" "}
                            {KDS_COMPLETION_HISTORY_COPY.itemUnit}
                          </Badge>
                          <Badge variant="outline">
                            {entry.itemQuantity}{" "}
                            {KDS_COMPLETION_HISTORY_COPY.portionUnit}
                          </Badge>
                        </div>

                        <ItemGroup className="mt-2 gap-1">
                          {getItemPreview(entry).map((item, index) => (
                            <Item
                              key={index}
                              role="listitem"
                              size="xs"
                              variant="muted"
                              className="min-w-0 px-2 py-1"
                            >
                              <ItemContent className="min-w-0 break-words leading-5">
                                {item}
                              </ItemContent>
                            </Item>
                          ))}
                        </ItemGroup>
                      </ItemContent>
                    </article>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
