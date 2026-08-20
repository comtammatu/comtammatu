"use client";

import { memo, useCallback, useMemo, type ReactNode } from "react";
import { AppEmptyState, OperationalTile } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { messages } from "@lib/messages";
import {
  LayoutGrid as IconLayoutGrid,
  MapPin as IconMapPin,
} from "lucide-react";
import type { BranchTable } from "./page";
import {
  getPosTableTileVisualState,
  getPosTableTileTone,
  type PosTableOrderVisualState,
} from "./_lib/table-order-visual-state";
import type { TableTimingInfo } from "./_lib/table-timing";
import { SELF_ORDER_VI, TABLE_VI } from "@comtammatu/shared/messages";

interface PosTableGateProps {
  tables: BranchTable[];
  selectedTableId: number | null;
  onTableSelect: (table: BranchTable) => void;
  /** Map<table_id, count of active orders on that table> for multi-order indicator */
  orderCountByTable?: Map<number, number>;
  /** Map<table_id, visual state derived from active unpaid orders. */
  tableOrderVisualStateByTable?: Map<number, PosTableOrderVisualState>;
  /** Map<table_id, formatted seating elapsed duration (e.g. "25p", "1h 15p")> */
  tableSeatingTimeByTable?: ReadonlyMap<number, string>;
  /** Map<table_id, detailed dining & wait latency timing info> */
  tableTimingByTable?: ReadonlyMap<number, TableTimingInfo>;
  /** Tables carrying a pending guest request from the public QR flow. */
  pendingSelfOrderTableIds?: ReadonlySet<number>;
  /** Tables where a guest tapped Gọi nhân viên. */
  staffCallTableIds?: ReadonlySet<number>;
  hasStackedTouchActions?: boolean;
  headerAction?: ReactNode;
  className?: string;
}

interface TableButtonProps {
  table: BranchTable;
  isSelected: boolean;
  orderCount: number;
  orderVisualState?: PosTableOrderVisualState;
  seatingDuration?: string;
  tableTiming?: TableTimingInfo;
  hasPendingSelfOrderRequest: boolean;
  hasStaffCall: boolean;
  onTableSelect: (table: BranchTable) => void;
}

const TableButton = memo(function TableButton({
  table,
  isSelected,
  orderCount,
  orderVisualState,
  seatingDuration,
  tableTiming,
  hasPendingSelfOrderRequest,
  hasStaffCall,
  onTableSelect,
}: TableButtonProps) {
  const handleClick = useCallback(
    () => onTableSelect(table),
    [onTableSelect, table],
  );
  const tileVisualState = getPosTableTileVisualState({
    tableStatus: table.status,
    orderCount,
    orderVisualState,
  });
  const displaySeatingDuration =
    tableTiming?.seatingDuration ?? seatingDuration;

  let statusLabel: string;
  let statusVariant: "outline" | "success" | "warning" | "destructive" | "secondary";

  if (isSelected) {
    statusLabel = messages.pos.tableGate.selected;
    statusVariant = "outline";
  } else if (tileVisualState === "empty") {
    statusLabel = messages.pos.tableGate.available;
    statusVariant = "secondary";
  } else if (orderVisualState === "active" || tileVisualState === "active") {
    const waitDuration =
      tableTiming?.kitchenWaitDuration ?? displaySeatingDuration ?? "1p";
    if (tableTiming?.kitchenLatencyTone === "urgent") {
      statusLabel = messages.pos.tableGate.overdueElapsed(waitDuration);
      statusVariant = "destructive";
    } else if (tableTiming?.kitchenLatencyTone === "warning") {
      statusLabel = messages.pos.tableGate.waitingElapsed(waitDuration);
      statusVariant = "warning";
    } else {
      statusLabel = messages.pos.tableGate.waitingElapsed(waitDuration);
      statusVariant = "outline";
    }
  } else if (tileVisualState === "ready" || tileVisualState === "served") {
    statusLabel = messages.pos.tableGate.diningTime(displaySeatingDuration ?? "1p");
    statusVariant = "secondary";
  } else {
    statusLabel = messages.pos.tableGate.reserved;
    statusVariant = "secondary";
  }

  const tileTone = getPosTableTileTone(tileVisualState);
  const effectiveTileTone =
    tileVisualState === "empty"
      ? "default"
      : statusVariant === "destructive" || statusVariant === "warning"
        ? "warning"
        : tileTone;

  return (
    <OperationalTile
      type="button"
      selected={isSelected}
      tone={effectiveTileTone}
      size="tile"
      aria-label={`${messages.pos.tableGate.tableAria(table.number, statusLabel)}${displaySeatingDuration ? `, ${displaySeatingDuration}` : ""}${hasStaffCall ? `, ${SELF_ORDER_VI.staffCallBadge}` : ""}${hasPendingSelfOrderRequest ? ", QR đang chờ duyệt" : ""}`}
      className={cn(
        "w-full min-w-0 flex-col items-stretch justify-start gap-1.5 p-2.5 text-left whitespace-normal hover:shadow-effect-card-hover active:scale-[0.98] transition-transform touch-manipulation select-none chrome-tap sm:gap-3 sm:p-3.5 lg:p-4",
        tileVisualState === "served" && !isSelected && "bg-success/10",
      )}
      onClick={handleClick}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-1">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-60">
          {TABLE_VI.long}
        </p>
        <Badge
          variant={statusVariant}
          className={cn(
            "min-w-0 shrink truncate text-xs font-semibold",
            isSelected &&
              "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground",
            statusVariant === "outline" &&
              tileVisualState === "active" &&
              !isSelected &&
              "border-warning/20 bg-warning/10 text-warning",
          )}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-1.5">
        <p className="shrink-0 text-xl font-semibold leading-none tabular-nums sm:text-2xl">
          {table.number}
        </p>
        {hasStaffCall ? (
          <Badge variant="warning" className="shrink-0 truncate text-xs font-semibold">
            {SELF_ORDER_VI.staffCallBadge}
          </Badge>
        ) : hasPendingSelfOrderRequest ? (
          <Badge variant="warning" className="shrink-0 truncate text-xs font-semibold">
            QR ⏳
          </Badge>
        ) : orderCount >= 2 ? (
          <Badge variant="secondary" className="shrink-0 truncate text-xs font-semibold">
            {messages.pos.tableGate.multiBill(orderCount)}
          </Badge>
        ) : null}
      </div>
    </OperationalTile>
  );
});

function PosTableGateComponent({
  tables,
  selectedTableId,
  onTableSelect,
  orderCountByTable,
  tableOrderVisualStateByTable,
  tableSeatingTimeByTable,
  tableTimingByTable,
  pendingSelfOrderTableIds,
  staffCallTableIds,
  hasStackedTouchActions = false,
  headerAction,
  className,
}: PosTableGateProps) {
  const tableGroups = useMemo(() => {
    const map = new Map<string, BranchTable[]>();
    for (const table of tables) {
      const zoneName =
        table.branch_zones?.name ?? messages.pos.tableGate.noZone;
      const group = map.get(zoneName);
      if (group) group.push(table);
      else map.set(zoneName, [table]);
    }

    return Array.from(map.entries()).map(([zoneName, zoneTables]) => ({
      zoneName,
      zoneTables,
    }));
  }, [tables]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {tables.length === 0 ? (
        <AppEmptyState
          title={messages.pos.tableGate.empty}
          icon={<IconLayoutGrid />}
          className="flex-1"
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex w-full flex-col gap-4 px-2 pt-2 md:px-4 md:pt-4",
              hasStackedTouchActions ? "pb-40 xl:pb-4" : "pb-28 xl:pb-4",
            )}
          >
            {headerAction ? (
              <div className="w-full md:max-w-md">{headerAction}</div>
            ) : null}
            {tableGroups.map(({ zoneName, zoneTables }) => (
              <section key={zoneName} className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconMapPin className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {zoneName}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {zoneTables.map((table) => (
                    <TableButton
                      key={table.id}
                      table={table}
                      isSelected={selectedTableId === table.id}
                      orderCount={orderCountByTable?.get(table.id) ?? 0}
                      orderVisualState={tableOrderVisualStateByTable?.get(
                        table.id,
                      )}
                      seatingDuration={tableSeatingTimeByTable?.get(table.id)}
                      tableTiming={tableTimingByTable?.get(table.id)}
                      hasPendingSelfOrderRequest={
                        pendingSelfOrderTableIds?.has(table.id) ?? false
                      }
                      hasStaffCall={staffCallTableIds?.has(table.id) ?? false}
                      onTableSelect={onTableSelect}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export const PosTableGate = memo(PosTableGateComponent);
