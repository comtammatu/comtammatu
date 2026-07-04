"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { RunnerIdleVisual, type RunnerIdleState } from "./runner-idle-visual";
import { RunnerWaitTime } from "./runner-wait-time";

const RUNNER_EXIT_MS = 320;
const RUNNER_ROW_LIMIT_BASE = 4;
const RUNNER_ROW_LIMIT_XL = 6;
const RUNNER_COLUMN_SPAN = {
  order: 4,
  quantity: 3,
  status: 4,
  wait: 1,
} as const;
const RUNNER_BOARD_COPY = {
  pending: "Đang chờ",
  idleEmptyTitle: "Chưa có món cần phục vụ.",
  idleDoneTitle: "Đã phục vụ hết món đang chờ.",
  idleBrandLine: "Món mới sẽ hiện ngay khi bếp gọi phục vụ.",
  itemUnit: "món",
  moreOrders: (count: number) => `Còn ${String(count)} đơn đang chờ`,
  tableHeaders: {
    order: "Đơn",
    quantity: "Số món",
    status: "Trạng thái",
    wait: "Chờ",
  },
} as const;

export type RunnerBoardStatus = "pending";

export type RunnerBoardRow = {
  key: string;
  orderLabel: string;
  itemQuantity: number;
  status: RunnerBoardStatus;
  sortAt: string;
};

type RunnerColumnSpan =
  (typeof RUNNER_COLUMN_SPAN)[keyof typeof RUNNER_COLUMN_SPAN];

type DisplayRunnerBoardRow = RunnerBoardRow & {
  exiting?: boolean;
};

export function RunnerOrderBoardClient({
  rows,
  nowMs,
  idleState,
}: {
  rows: RunnerBoardRow[];
  nowMs: number;
  idleState: RunnerIdleState | null;
}) {
  const displayRows = useRunnerDisplayRows(rows);

  if (displayRows.length === 0) {
    const resolvedIdleState = idleState ?? "empty";

    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-4 text-center">
        <RunnerIdleAtmosphere state={resolvedIdleState} />
        <div className="relative z-10 flex max-w-6xl flex-col items-center justify-center gap-4">
          <RunnerIdleVisual state={resolvedIdleState} />
          <div className="flex max-w-full flex-col items-center gap-2">
            <p className="max-w-full font-heading text-runner-board font-semibold text-foreground">
              {resolvedIdleState === "done"
                ? RUNNER_BOARD_COPY.idleDoneTitle
                : RUNNER_BOARD_COPY.idleEmptyTitle}
            </p>
            <p className="max-w-full font-heading text-runner-empty-secondary font-semibold text-muted-foreground">
              {RUNNER_BOARD_COPY.idleBrandLine}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const visibleRows = displayRows.slice(0, RUNNER_ROW_LIMIT_XL);
  const overflowBase = displayRows.length - RUNNER_ROW_LIMIT_BASE;
  const overflowXl = displayRows.length - RUNNER_ROW_LIMIT_XL;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="grid grid-cols-12 divide-x divide-border/70 border-b border-border bg-muted/70">
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.order}>
          {RUNNER_BOARD_COPY.tableHeaders.order}
        </RunnerColumnHeader>
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.quantity}>
          {RUNNER_BOARD_COPY.tableHeaders.quantity}
        </RunnerColumnHeader>
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.status}>
          {RUNNER_BOARD_COPY.tableHeaders.status}
        </RunnerColumnHeader>
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.wait} align="right">
          {RUNNER_BOARD_COPY.tableHeaders.wait}
        </RunnerColumnHeader>
      </div>
      <ItemGroup
        role="list"
        className="grid min-h-0 flex-1 grid-rows-4 overflow-hidden xl:grid-rows-6 p-0 rounded-none border-0"
      >
        {visibleRows.map((row, index) => (
          <RunnerOrderListRow
            key={row.key}
            row={row}
            featured={!row.exiting && index === 0}
            hiddenBelowXl={index >= RUNNER_ROW_LIMIT_BASE}
            nowMs={nowMs}
          />
        ))}
      </ItemGroup>
      {overflowBase > 0 ? (
        <p
          className={cn(
            "shrink-0 border-t border-border bg-muted/70 px-4 py-2 text-center font-heading text-runner-footer font-semibold text-muted-foreground",
            overflowXl <= 0 && "xl:hidden",
          )}
        >
          <span className="xl:hidden">
            {RUNNER_BOARD_COPY.moreOrders(overflowBase)}
          </span>
          {overflowXl > 0 ? (
            <span className="hidden xl:inline">
              {RUNNER_BOARD_COPY.moreOrders(overflowXl)}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function useRunnerDisplayRows(rows: RunnerBoardRow[]): DisplayRunnerBoardRow[] {
  const previousRowsRef = useRef(rows);
  const [displayRows, setDisplayRows] = useState<DisplayRunnerBoardRow[]>(() =>
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
      const mergedRows: DisplayRunnerBoardRow[] = [];
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
    }, RUNNER_EXIT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [rows]);

  return displayRows;
}

function toVisibleDisplayRow(row: RunnerBoardRow): DisplayRunnerBoardRow {
  return {
    ...row,
    exiting: false,
  };
}

function RunnerIdleAtmosphere({ state }: { state: RunnerIdleState }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-runner-idle-atmosphere={state}
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

function RunnerColumnHeader({
  children,
  span,
  align = "left",
}: {
  children: ReactNode;
  span: RunnerColumnSpan;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "py-2 font-heading text-runner-header font-semibold text-foreground xl:py-4",
        span === RUNNER_COLUMN_SPAN.wait ? "px-2 xl:px-4" : "px-4",
        getRunnerColumnSpanClass(span),
        align === "right" && "text-right",
      )}
    >
      {children}
    </div>
  );
}

function RunnerOrderListRow({
  row,
  featured,
  hiddenBelowXl,
  nowMs,
}: {
  row: DisplayRunnerBoardRow;
  featured: boolean;
  hiddenBelowXl: boolean;
  nowMs: number;
}) {
  const statusLabel = getRunnerStatusLabel(row.status);

  return (
    <Item
      role="listitem"
      aria-current={featured ? "true" : undefined}
      data-runner-exiting={row.exiting ? "true" : undefined}
      data-runner-featured={featured ? "true" : undefined}
      className={cn(
        "grid h-full min-h-0 w-full grid-cols-12 items-stretch divide-x divide-border/70 border-b border-l-4 p-0 rounded-none border-x-0 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
        getRunnerRowClass(),
        featured && "border-l-primary",
        featured && "bg-warning/15 ring-1 ring-inset ring-warning/40",
        hiddenBelowXl && "hidden xl:grid",
        row.exiting &&
          "pointer-events-none -translate-x-full opacity-0 motion-safe:scale-95",
      )}
    >
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.order} mono>
        {row.orderLabel}
      </RunnerOrderCell>
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.quantity} mono>
        {formatCount(row.itemQuantity)} {RUNNER_BOARD_COPY.itemUnit}
      </RunnerOrderCell>
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.status} mono>
        {statusLabel}
      </RunnerOrderCell>
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.wait} align="right" mono>
        <RunnerWaitTime startIso={row.sortAt} initialNowMs={nowMs} />
      </RunnerOrderCell>
    </Item>
  );
}

function RunnerOrderCell({
  children,
  span,
  align = "left",
  mono = false,
}: {
  children: ReactNode;
  span: RunnerColumnSpan;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center py-2 xl:py-4",
        span === RUNNER_COLUMN_SPAN.wait ? "px-2 xl:px-4" : "px-4",
        getRunnerColumnSpanClass(span),
        align === "right" && "text-right",
      )}
    >
      <div
        className={cn(
          "min-w-0 whitespace-normal break-words font-semibold text-runner-board",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function getRunnerColumnSpanClass(span: RunnerColumnSpan): string {
  if (span === 4) return "col-span-4";
  if (span === 3) return "col-span-3";
  return "col-span-1";
}

function getRunnerStatusLabel(_status: RunnerBoardStatus): "Đang chờ" {
  return RUNNER_BOARD_COPY.pending;
}

function getRunnerRowClass(): string {
  return "border-warning/70 bg-warning/5";
}
