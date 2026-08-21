"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { PickupOrderType } from "@comtammatu/shared/pickup";
import { formatCount } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { DeliveryPlatformMark } from "@/components/delivery-platform-mark";
import { PickupIdleVisual, type PickupIdleState } from "./pickup-idle-visual";
import { PickupWaitTime } from "./pickup-wait-time";

const PICKUP_EXIT_MS = 320;
const PICKUP_ROW_LIMIT_BASE = 4;
const PICKUP_ROW_LIMIT_XL = 6;
const PICKUP_OVERFLOW_TILE_LIMIT = 4;
const PICKUP_OVERFLOW_PREVIEW_LIMIT = PICKUP_OVERFLOW_TILE_LIMIT - 1;
const PICKUP_COLUMN_CLASS = {
  order: "col-span-1 border-r sm:col-span-4",
  quantity: "col-span-1 sm:col-span-3 sm:border-r",
  status: "col-span-1 max-sm:border-t sm:col-span-4 sm:border-r",
  wait: "col-span-1 max-sm:border-l max-sm:border-t sm:col-span-1",
} as const;
const PICKUP_BOARD_COPY = {
  inProgress: "Đang làm",
  pending: "Chờ",
  idleEmptyTitle: "Chưa có món cần phục vụ.",
  idleDoneTitle: "Đã phục vụ hết món đang chờ.",
  idleBrandLine: "Món mới sẽ hiện ngay khi bếp gọi phục vụ.",
  itemUnit: "món",
  moreOrders: (count: number) => `Còn ${String(count)} đơn`,
  overflowLabel: "Đơn tiếp theo",
  tableHeaders: {
    order: "Đơn",
    quantity: "Số món",
    status: "Trạng thái",
    wait: "Chờ",
  },
} as const;

export type PickupBoardStatus = "in_progress" | "pending";

export type PickupBoardRow = {
  key: string;
  orderLabel: string;
  itemQuantity: number;
  status: PickupBoardStatus;
  sortAt: string;
  orderType?: PickupOrderType;
  deliveryPlatform?: string | null;
  externalOrderRef?: string | null;
  orderNumber?: string;
};

type PickupColumn = keyof typeof PICKUP_COLUMN_CLASS;

type DisplayPickupBoardRow = PickupBoardRow & {
  exiting?: boolean;
};

export function PickupOrderBoardClient({
  rows,
  nowMs,
  idleState,
}: {
  rows: PickupBoardRow[];
  nowMs: number;
  idleState: PickupIdleState | null;
}) {
  const displayRows = usePickupDisplayRows(rows);
  const usesBaseRowLimit = useIsMobile(1280);

  if (displayRows.length === 0) {
    const resolvedIdleState = idleState ?? "empty";

    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-4 text-center">
        <PickupIdleAtmosphere state={resolvedIdleState} />
        <div className="relative z-10 flex max-w-6xl flex-col items-center justify-center gap-4">
          <PickupIdleVisual state={resolvedIdleState} />
          <div className="flex max-w-full flex-col items-center gap-2">
            <p className="max-w-full font-heading text-pickup-board font-semibold text-foreground">
              {resolvedIdleState === "done"
                ? PICKUP_BOARD_COPY.idleDoneTitle
                : PICKUP_BOARD_COPY.idleEmptyTitle}
            </p>
            <p className="max-w-full font-heading text-pickup-empty-secondary font-semibold text-muted-foreground">
              {PICKUP_BOARD_COPY.idleBrandLine}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rowLimit = usesBaseRowLimit
    ? PICKUP_ROW_LIMIT_BASE
    : PICKUP_ROW_LIMIT_XL;
  const visibleRows = displayRows.slice(0, rowLimit);
  const overflowRows = displayRows.slice(rowLimit);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="grid grid-cols-2 border-b border-border bg-muted/50 sm:grid-cols-12">
        <PickupColumnHeading column="order">
          {PICKUP_BOARD_COPY.tableHeaders.order}
        </PickupColumnHeading>
        <PickupColumnHeading column="quantity">
          {PICKUP_BOARD_COPY.tableHeaders.quantity}
        </PickupColumnHeading>
        <PickupColumnHeading column="status">
          {PICKUP_BOARD_COPY.tableHeaders.status}
        </PickupColumnHeading>
        <PickupColumnHeading column="wait" align="right">
          {PICKUP_BOARD_COPY.tableHeaders.wait}
        </PickupColumnHeading>
      </div>
      <ItemGroup
        role="list"
        className="grid min-h-0 flex-1 grid-rows-4 overflow-hidden xl:grid-rows-6 p-0 rounded-none border-0"
      >
        {visibleRows.map((row, index) => (
          <PickupOrderListRow
            key={row.key}
            row={row}
            featured={!row.exiting && index === 0}
            queueIndex={index + 1}
            nowMs={nowMs}
          />
        ))}
      </ItemGroup>
      <PickupOverflowRail rows={overflowRows} />
    </div>
  );
}

function PickupOverflowRail({ rows }: { rows: DisplayPickupBoardRow[] }) {
  const activeRows = rows.filter((row) => row.exiting !== true);
  const previewRows = activeRows.slice(0, PICKUP_OVERFLOW_PREVIEW_LIMIT);
  const remainingCount = activeRows.length - previewRows.length;

  if (activeRows.length === 0) return null;

  return (
    <div
      className="shrink-0 border-t border-border bg-muted/50 p-2"
      data-pickup-overflow-rail
    >
      <div
        aria-label={PICKUP_BOARD_COPY.overflowLabel}
        className="grid grid-flow-col auto-cols-fr gap-2"
        role="list"
      >
        {previewRows.map((row) => (
          <Item
            key={row.key}
            className="min-w-0 border-border bg-background p-2"
            role="listitem"
          >
            <span className="inline-flex items-center gap-1.5 truncate font-heading text-pickup-footer font-semibold text-foreground">
              {row.orderType === "delivery" && row.deliveryPlatform ? (
                <DeliveryPlatformMark
                  platform={row.deliveryPlatform}
                  size="xs"
                />
              ) : null}
              <span className="truncate">{row.orderLabel}</span>
            </span>
            <span className="font-mono text-pickup-footer text-muted-foreground tabular-nums">
              {formatCount(row.itemQuantity)} {PICKUP_BOARD_COPY.itemUnit}
            </span>
          </Item>
        ))}
        {remainingCount > 0 ? (
          <Item
            className="items-center justify-center border-border bg-background p-2 text-center"
            role="listitem"
          >
            <span className="font-heading text-pickup-footer font-semibold text-foreground">
              {PICKUP_BOARD_COPY.moreOrders(remainingCount)}
            </span>
          </Item>
        ) : null}
      </div>
    </div>
  );
}

function usePickupDisplayRows(rows: PickupBoardRow[]): DisplayPickupBoardRow[] {
  const previousRowsRef = useRef(rows);
  const [displayRows, setDisplayRows] = useState<DisplayPickupBoardRow[]>(() =>
    rows.map(toVisibleDisplayRow),
  );

  useEffect(() => {
    const previousRows = previousRowsRef.current;
    const nextByKey = new Map(rows.map((row) => [row.key, row]));
    const nextKeys = new Set(nextByKey.keys());
    const removedRows = previousRows.filter((row) => !nextKeys.has(row.key));

    previousRowsRef.current = rows;

    if (removedRows.length === 0) {
      setDisplayRows(rows.map(toVisibleDisplayRow));
      return;
    }

    const removedKeys = new Set(removedRows.map((row) => row.key));

    setDisplayRows((currentRows) => {
      const currentByKey = new Map(currentRows.map((row) => [row.key, row]));
      const mergedRows: DisplayPickupBoardRow[] = [];
      const seenKeys = new Set<string>();

      const baseRows = currentRows.length > 0 ? currentRows : previousRows;
      for (const row of baseRows) {
        const nextRow = nextByKey.get(row.key);

        if (nextRow !== undefined) {
          mergedRows.push(toVisibleDisplayRow(nextRow));
          seenKeys.add(row.key);
          continue;
        }

        if (removedKeys.has(row.key)) {
          mergedRows.push({
            ...(currentByKey.get(row.key) ?? row),
            exiting: true,
          });
          seenKeys.add(row.key);
        }
      }

      for (const row of rows) {
        if (!seenKeys.has(row.key)) {
          mergedRows.push(toVisibleDisplayRow(row));
        }
      }

      return mergedRows;
    });

    const timeoutId = window.setTimeout(() => {
      setDisplayRows((currentRows) =>
        currentRows.filter(
          (row) => row.exiting !== true || !removedKeys.has(row.key),
        ),
      );
    }, PICKUP_EXIT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [rows]);

  return displayRows;
}

function toVisibleDisplayRow(row: PickupBoardRow): DisplayPickupBoardRow {
  return {
    ...row,
    exiting: false,
  };
}

function PickupIdleAtmosphere({ state }: { state: PickupIdleState }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-pickup-idle-atmosphere={state}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent",
          state === "done"
            ? "from-success/15 via-success/5"
            : "from-warning/15 via-warning/5",
        )}
      />
      <div className="absolute inset-x-0 bottom-0 border-t border-border/80 bg-muted/30" />
    </div>
  );
}

function PickupColumnHeading({
  children,
  column,
  align = "left",
}: {
  children: ReactNode;
  column: PickupColumn;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "border-border/70 py-2 font-heading text-pickup-header font-semibold text-foreground xl:py-4",
        column === "wait" ? "px-2 xl:px-4" : "px-2 sm:px-4",
        PICKUP_COLUMN_CLASS[column],
        align === "right" && "text-right",
      )}
    >
      {children}
    </div>
  );
}

function PickupOrderListRow({
  row,
  featured,
  queueIndex,
  nowMs,
}: {
  row: DisplayPickupBoardRow;
  featured: boolean;
  queueIndex: number;
  nowMs: number;
}) {
  const statusLabel = getPickupStatusLabel(row.status);
  const isDelivery = row.orderType === "delivery";

  return (
    <Item
      role="listitem"
      aria-current={featured ? "true" : undefined}
      data-pickup-exiting={row.exiting ? "true" : undefined}
      data-pickup-featured={featured ? "true" : undefined}
      className={cn(
        "grid h-full min-h-0 w-full grid-cols-2 items-stretch border-b border-l-4 p-0 rounded-none border-x-0 motion-safe:transition-[background-color,border-color,opacity,transform] motion-safe:duration-300 motion-safe:ease-out sm:grid-cols-12",
        getPickupRowClass(row.status),
        featured && "border-l-primary",
        featured && "bg-warning/15 ring-1 ring-inset ring-warning/20",
        row.exiting &&
          "pointer-events-none -translate-x-full opacity-0 motion-safe:scale-95",
      )}
    >
      <PickupOrderCell column="order" mono>
        <span className="inline-flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-pickup-header">
            #{queueIndex}
          </span>
          {isDelivery && row.deliveryPlatform ? (
            <DeliveryPlatformMark
              platform={row.deliveryPlatform}
              size="md"
            />
          ) : null}
          <span>{row.orderLabel}</span>
        </span>
      </PickupOrderCell>
      <PickupOrderCell column="quantity" mono>
        {formatCount(row.itemQuantity)} {PICKUP_BOARD_COPY.itemUnit}
      </PickupOrderCell>
      <PickupOrderCell column="status" mono>
        {statusLabel}
      </PickupOrderCell>
      <PickupOrderCell column="wait" align="right" mono>
        <PickupWaitTime startIso={row.sortAt} initialNowMs={nowMs} />
      </PickupOrderCell>
    </Item>
  );
}

function PickupOrderCell({
  children,
  column,
  align = "left",
  mono = false,
}: {
  children: ReactNode;
  column: PickupColumn;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center border-border/70 py-2 xl:py-4",
        column === "wait" ? "px-2 xl:px-4" : "px-2 sm:px-4",
        PICKUP_COLUMN_CLASS[column],
        align === "right" && "text-right",
      )}
    >
      <div
        className={cn(
          "min-w-0 whitespace-normal break-words font-semibold text-pickup-board",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function getPickupStatusLabel(status: PickupBoardStatus): string {
  if (status === "in_progress") {
    return PICKUP_BOARD_COPY.inProgress;
  }
  return PICKUP_BOARD_COPY.pending;
}

function getPickupRowClass(status?: PickupBoardStatus): string {
  if (status === "in_progress") {
    return "border-warning/20 bg-warning/15";
  }
  return "border-warning/20 bg-warning/10";
}
