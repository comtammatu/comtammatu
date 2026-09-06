"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNTimeSeconds, getVNDateString } from "@comtammatu/shared/time";
import { getOrderTypeLabelVi } from "@comtammatu/shared/labels";
import { ACTIONS_VI, KDS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Item, ItemContent } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { BusinessDatePicker } from "@/components/form";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { AppEmptyState, OperationalBoardCard, StationSheet } from "@/components/surface";
import {
  AlertCircle as IconAlertCircle,
  History as IconHistory,
  RefreshCcw as IconRefresh,
  User as IconUser,
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
    "Nhật ký thao tác món theo ngày: gửi bếp, làm món, hoàn tất, gọi lại và huỷ.",
  sourceTitle: "Sự kiện bếp",
  date: "Ngày",
  eventType: "Loại sự kiện",
  reload: "Tải lại",
  truncated:
    "Ngày này có hơn 100 sự kiện. Đang hiển thị 100 sự kiện mới nhất; hãy lọc theo loại sự kiện để đối chiếu đầy đủ.",
  reasonPrefix: "Lý do:",
  sidePrefix: "Kèm:",
} as const;

type KdsHistoryEventType = KdsCompletionHistoryEvent["event_type"] | "all";

const EVENT_TYPE_CONFIG: Record<
  KdsCompletionHistoryEvent["event_type"],
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive" | "success" | "warning";
  }
> = {
  completed: { label: "Hoàn tất", variant: "success" },
  served: { label: "Đã phục vụ", variant: "success" },
  preparing: { label: "Đang làm", variant: "secondary" },
  recalled: { label: "Gọi làm lại", variant: "warning" },
  cancelled: { label: "Đã huỷ", variant: "destructive" },
  out_of_stock: { label: "Hết món", variant: "destructive" },
  sent: { label: "Đã gửi bếp", variant: "outline" },
};

const EVENT_TYPE_LABELS: Record<KdsHistoryEventType, string> = {
  all: "Tất cả",
  sent: "Đã gửi bếp",
  preparing: "Đang làm",
  completed: "Hoàn tất",
  recalled: "Gọi làm lại",
  served: "Đã phục vụ",
  cancelled: "Đã huỷ",
  out_of_stock: "Hết món",
};

const QUICK_FILTER_ITEMS: ReadonlyArray<{
  type: KdsHistoryEventType;
  label: string;
}> = [
  { type: "all", label: "Tất cả" },
  { type: "completed", label: "Hoàn tất" },
  { type: "preparing", label: "Đang làm" },
  { type: "recalled", label: "Gọi làm lại" },
  { type: "cancelled", label: "Đã huỷ" },
];

function KdsHistoryCard({ entry }: { entry: KdsOperationalHistoryEntry }) {
  const eventConfig = EVENT_TYPE_CONFIG[entry.eventType] ?? {
    label: entry.eventType,
    variant: "outline",
  };
  const isProblemEvent =
    entry.eventType === "cancelled" ||
    entry.eventType === "out_of_stock" ||
    entry.eventType === "recalled" ||
    Boolean(entry.reason);

  const contextLabel =
    entry.orderType === "dine_in" && entry.tableNumber !== null
      ? `Bàn ${String(entry.tableNumber)}`
      : getOrderTypeLabelVi(entry.orderType);

  const timeStr = formatVNTimeSeconds(entry.occurredAt);

  return (
    <OperationalBoardCard
      data-testid={`kds-history-event-${String(entry.eventId)}`}
      className="flex flex-col gap-2 p-3 text-sm"
    >
      {/* 1. Header: Context (Table/Order) + Status Badge + Time */}
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-border/40 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
            <span className="font-heading text-base font-semibold text-foreground">
              {contextLabel}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              #{entry.orderNumber}
              {entry.kitchenTicketNumber ? ` · ${entry.kitchenTicketNumber}` : ""}
            </span>
          </div>
          {entry.stationName ? (
            <p className="truncate text-xs text-muted-foreground">
              {entry.stationName}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge
            variant={eventConfig.variant}
            className="px-2 py-0.5 text-xs font-semibold"
          >
            {eventConfig.label}
          </Badge>
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {timeStr}
          </time>
        </div>
      </div>

      {/* 2. Core Body: Quantity + Item Name (What kitchen cares about most) */}
      <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-lg font-semibold tabular-nums text-primary">
            {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: math multiplication sign */}
            {entry.quantity}×
          </span>
          <span className="min-w-0 break-words font-heading text-base font-semibold text-foreground">
            {entry.itemName}
          </span>
          {entry.variantName ? (
            <span className="text-xs text-muted-foreground">
              ({entry.variantName})
            </span>
          ) : null}
        </div>

        {/* Sides & Modifiers & Note */}
        {entry.sides.length > 0 ||
        entry.modifiers.length > 0 ||
        entry.note ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {entry.sides.map((side, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal">
                {KDS_COMPLETION_HISTORY_COPY.sidePrefix} {side}
              </Badge>
            ))}
            {entry.modifiers.map((mod, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal">
                {mod}
              </Badge>
            ))}
            {entry.note ? (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                &ldquo;{entry.note}&rdquo;
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 3. Issue Reason (If recalled / cancelled / reason present) */}
      {isProblemEvent && entry.reason ? (
        <div className="flex items-center gap-1.5 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <IconAlertCircle className="size-3.5 shrink-0" aria-hidden />
          <p className="min-w-0 break-words">
            <span className="font-semibold">{KDS_COMPLETION_HISTORY_COPY.reasonPrefix}</span>{" "}
            {entry.reason}
          </p>
        </div>
      ) : null}

      {/* 4. Footer: Actor name if available */}
      {entry.actorName ? (
        <div className="mt-auto flex min-w-0 items-center gap-1 pt-1 text-xs text-muted-foreground">
          <IconUser className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{entry.actorName}</span>
        </div>
      ) : null}
    </OperationalBoardCard>
  );
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
  const isCompactLayout = useIsMobile(1280);
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

  // Quick stats summary
  const stats = useMemo(() => {
    if (!history) {
      return { total: 0, completed: 0, preparing: 0, recalled: 0, cancelled: 0 };
    }
    let completed = 0;
    let preparing = 0;
    let recalled = 0;
    let cancelled = 0;
    for (const entry of history) {
      if (entry.eventType === "completed" || entry.eventType === "served") {
        completed++;
      } else if (entry.eventType === "preparing") {
        preparing++;
      } else if (entry.eventType === "recalled") {
        recalled++;
      } else if (entry.eventType === "cancelled" || entry.eventType === "out_of_stock") {
        cancelled++;
      }
    }
    return {
      total: history.length,
      completed,
      preparing,
      recalled,
      cancelled,
    };
  }, [history]);

  const getQuickFilterCount = (type: KdsHistoryEventType) => {
    if (type === "all") return stats.total;
    if (type === "completed") return stats.completed;
    if (type === "preparing") return stats.preparing;
    if (type === "recalled") return stats.recalled;
    if (type === "cancelled") return stats.cancelled;
    return 0;
  };

  return (
    <StationSheet
      open={open}
      onOpenChange={onOpenChange}
      side={isCompactLayout ? "bottom" : "right"}
      size="lg"
      fullscreen={isCompactLayout}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <IconHistory
            data-icon="inline-start"
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          {KDS_COMPLETION_HISTORY_COPY.title}
        </span>
      }
      description={KDS_COMPLETION_HISTORY_COPY.description}
      bodyClassName="p-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Top Filter Controls: Date, Event Type, Reload (All 48px touch) */}
        <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-3 sm:px-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kds-history-date" className="text-xs font-semibold">
                {KDS_COMPLETION_HISTORY_COPY.date}
              </Label>
              <BusinessDatePicker
                id="kds-history-date"
                value={date}
                onValueChange={setDate}
                size="touch"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kds-history-event-type" className="text-xs font-semibold">
                {KDS_COMPLETION_HISTORY_COPY.eventType}
              </Label>
              <Select
                value={eventType}
                onValueChange={(value) =>
                  setEventType(value as KdsHistoryEventType)
                }
              >
                <SelectTrigger id="kds-history-event-type" size="touch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value} size="touch">
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

          {/* Quick Filter Pills (1-tap 48px touch chips) */}
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_FILTER_ITEMS.map((item) => {
              const active = eventType === item.type;
              const count = getQuickFilterCount(item.type);
              return (
                <Button
                  key={item.type}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="touch"
                  className="shrink-0 gap-1.5 px-3 font-semibold text-xs"
                  onClick={() => setEventType(item.type)}
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-2xs opacity-80">
                    ({formatCount(count)})
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Event Content */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3 sm:p-4">
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
              <AppEmptyState
                compact
                className="min-h-32"
                title={KDS_VI.completionHistoryLoadFailed}
                description={error}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="mt-2"
                  onClick={loadHistory}
                >
                  <IconRefresh data-icon="inline-start" />
                  {ACTIONS_VI.retry}
                </Button>
              </AppEmptyState>
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
                  {KDS_COMPLETION_HISTORY_COPY.sourceTitle} ({formatCount(history.length)})
                </SectionLabel>
                {/* Responsive Multi-Column Event Card Grid */}
                <div
                  data-testid="kds-history-grid"
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3"
                >
                  {history.map((entry) => (
                    <KdsHistoryCard key={entry.eventId} entry={entry} />
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </StationSheet>
  );
}
