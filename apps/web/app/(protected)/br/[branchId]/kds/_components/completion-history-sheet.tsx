"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNDateTime, getVNDateString } from "@comtammatu/shared/time";
import { ORDER_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { KDS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Item, ItemContent, ItemGroup } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
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
  History as IconHistory,
  RefreshCcw as IconRefresh,
} from "lucide-react";
import { fetchKdsCompletionHistory } from "../actions";
import type {
  KdsCompletionHistoryEvent,
  KdsOperationalHistoryEntry,
} from "../_lib/completion-history";

const KDS_COMPLETION_HISTORY_LIMIT = 100;
const KDS_COMPLETION_HISTORY_COPY = {
  title: "Lịch sử KDS",
  description:
    "Dòng thời gian bất biến theo ngày, gồm gửi bếp, làm, hoàn thành, gọi lại, phục vụ và huỷ.",
  sourceTitle: "Sự kiện bếp",
  date: "Ngày",
  eventType: "Loại sự kiện",
  reload: "Tải lại",
  truncated:
    "Ngày này có hơn 100 sự kiện. Đang hiển thị 100 sự kiện mới nhất; hãy lọc theo loại sự kiện để đối chiếu đầy đủ.",
  legacySnapshot: "Snapshot lúc chuyển đổi; không phải lịch sử đầy đủ",
  station: (name: string | null, id: number) =>
    name ? `${name} · #${String(id)}` : `Trạm #${String(id)}`,
  ticket: (id: number) => `Ticket #${String(id)}`,
  actor: (name: string) => `Thao tác: ${name}`,
  unknownActor: "Không ghi nhận người thao tác",
  printJobs: (count: number) => `${formatCount(count)} print job liên kết`,
  itemLine: (quantity: number, name: string) =>
    `${String(quantity)}× ${name}`,
  sidesLine: (sides: string[]) => `Kèm: ${sides.join(", ")}`,
  modifiersLine: (modifiers: string[]) =>
    `Tuỳ chọn: ${modifiers.join(", ")}`,
  noteLine: (note: string) => `Ghi chú: ${note}`,
  reasonLine: (reason: string) => `Lý do: ${reason}`,
} as const;

type KdsHistoryEventType = KdsCompletionHistoryEvent["event_type"] | "all";

const EVENT_TYPE_LABELS: Record<KdsHistoryEventType, string> = {
  all: "Tất cả",
  sent: "Đã gửi bếp",
  preparing: "Đang làm",
  completed: "Hoàn thành",
  recalled: "Gọi làm lại",
  served: "Đã phục vụ",
  cancelled: "Đã huỷ",
  out_of_stock: "Hết món",
};

const PRINT_STATUS_LABELS: Record<string, string> = {
  pending: "chờ in",
  processing: "đang in",
  printed: "đã in",
  failed: "in lỗi",
  expired: "hết hạn",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: ORDER_TYPE_LABELS_VI.dine_in,
  takeaway: ORDER_TYPE_LABELS_VI.takeaway,
  delivery: "Giao hàng",
} as const;

function getEntryContext(entry: KdsOperationalHistoryEntry): string {
  const orderType = ORDER_TYPE_LABELS[entry.orderType] ?? entry.orderType;
  const table = entry.tableNumber === null ? null : `Bàn ${entry.tableNumber}`;
  return [orderType, table, `Đơn #${entry.orderNumber}`]
    .filter(Boolean)
    .join(" · ");
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
  const [history, setHistory] = useState<KdsOperationalHistoryEntry[] | null>(
    null,
  );
  const [date, setDate] = useState(getVNDateString());
  const [eventType, setEventType] = useState<KdsHistoryEventType>("all");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadHistory = useCallback(() => {
    startTransition(async () => {
      const result = await fetchKdsCompletionHistory({
        branchId,
        date,
        eventType,
        limit: KDS_COMPLETION_HISTORY_LIMIT,
      });
      if (result.success && result.data) {
        setHistory(result.data.entries);
        setTruncated(result.data.truncated);
        setError(null);
        return;
      }
      setHistory([]);
      setTruncated(false);
      setError(result.error ?? KDS_VI.completionHistoryLoadFailed);
    });
  }, [branchId, date, eventType]);

  useEffect(() => {
    if (!open) {
      setHistory(null);
      setTruncated(false);
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

        <div className="grid gap-3 border-y px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kds-history-date" className="text-xs">
              {KDS_COMPLETION_HISTORY_COPY.date}
            </Label>
            <InputGroup>
              <InputGroupInput
                id="kds-history-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </InputGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kds-history-event-type" className="text-xs">
              {KDS_COMPLETION_HISTORY_COPY.eventType}
            </Label>
            <Select
              value={eventType}
              onValueChange={(value) =>
                setEventType(value as KdsHistoryEventType)
              }
            >
              <SelectTrigger id="kds-history-event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="touch"
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

            {!error && truncated && (
              <Alert>
                <AlertDescription>
                  {KDS_COMPLETION_HISTORY_COPY.truncated}
                </AlertDescription>
              </Alert>
            )}

            {!isPending &&
              !error &&
              history !== null &&
              history.length === 0 && (
                <AppEmptyState compact title={KDS_VI.completionHistoryEmpty} />
              )}

            {history && history.length > 0 && (
              <>
                <SectionLabel>
                  {KDS_COMPLETION_HISTORY_COPY.sourceTitle}
                </SectionLabel>
                <ItemGroup>
                  {history.map((entry) => (
                    <Item
                      key={entry.eventId}
                      role="listitem"
                      variant="outline"
                      className="items-start bg-card p-3 text-sm"
                      render={<article />}
                    >
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
                          <Badge
                            variant={
                              entry.eventType === "cancelled" ||
                              entry.eventType === "out_of_stock"
                                ? "destructive"
                                : entry.eventType === "completed" ||
                                    entry.eventType === "served"
                                  ? "success"
                                  : "outline"
                            }
                            className="shrink-0"
                          >
                            {EVENT_TYPE_LABELS[entry.eventType]}
                          </Badge>
                        </div>

                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                          <time className="font-mono text-xs text-muted-foreground">
                            {formatVNDateTime(entry.occurredAt)}
                          </time>
                          <Badge variant="outline">
                            {KDS_COMPLETION_HISTORY_COPY.station(
                              entry.stationName,
                              entry.stationId,
                            )}
                          </Badge>
                          <Badge variant="outline">
                            {KDS_COMPLETION_HISTORY_COPY.ticket(entry.ticketId)}
                          </Badge>
                        </div>

                        <div className="mt-2 rounded-md bg-muted px-2 py-1.5">
                          <p className="break-words text-sm font-medium">
                            {KDS_COMPLETION_HISTORY_COPY.itemLine(
                              entry.quantity,
                              entry.itemName,
                            )}
                            {entry.variantName ? ` · ${entry.variantName}` : ""}
                          </p>
                          {entry.sides.length > 0 && (
                            <p className="break-words text-xs text-muted-foreground">
                              {KDS_COMPLETION_HISTORY_COPY.sidesLine(
                                entry.sides,
                              )}
                            </p>
                          )}
                          {entry.modifiers.length > 0 && (
                            <p className="break-words text-xs text-muted-foreground">
                              {KDS_COMPLETION_HISTORY_COPY.modifiersLine(
                                entry.modifiers,
                              )}
                            </p>
                          )}
                          {entry.note && (
                            <p className="break-words text-xs text-muted-foreground">
                              {KDS_COMPLETION_HISTORY_COPY.noteLine(entry.note)}
                            </p>
                          )}
                        </div>

                        <p className="mt-2 text-xs text-muted-foreground">
                          {entry.actorName
                            ? KDS_COMPLETION_HISTORY_COPY.actor(entry.actorName)
                            : KDS_COMPLETION_HISTORY_COPY.unknownActor}
                          {entry.reason
                            ? ` · ${KDS_COMPLETION_HISTORY_COPY.reasonLine(entry.reason)}`
                            : ""}
                        </p>
                        {entry.evidenceSource === "legacy_live_snapshot" && (
                          <p className="mt-1 text-xs text-warning">
                            {KDS_COMPLETION_HISTORY_COPY.legacySnapshot}
                          </p>
                        )}
                        {entry.printJobs.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {KDS_COMPLETION_HISTORY_COPY.printJobs(
                              entry.printJobs.length,
                            )}
                            :{" "}
                            {entry.printJobs
                              .map(
                                (job) =>
                                  `#${String(job.id)} (${PRINT_STATUS_LABELS[job.status] ?? "không xác định"})`,
                              )
                              .join(", ")}
                          </p>
                        )}
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
