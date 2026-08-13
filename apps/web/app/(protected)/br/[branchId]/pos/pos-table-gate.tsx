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
import { SELF_ORDER_VI, TABLE_VI } from "@comtammatu/shared/messages";

interface PosTableGateProps {
  tables: BranchTable[];
  selectedTableId: number | null;
  onTableSelect: (table: BranchTable) => void;
  /** Map<table_id, count of active orders on that table> for multi-order indicator */
  orderCountByTable?: Map<number, number>;
  /** Map<table_id, visual state derived from active unpaid orders. */
  tableOrderVisualStateByTable?: Map<number, PosTableOrderVisualState>;
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
  hasPendingSelfOrderRequest: boolean;
  hasStaffCall: boolean;
  onTableSelect: (table: BranchTable) => void;
}

const TableButton = memo(function TableButton({
  table,
  isSelected,
  orderCount,
  orderVisualState,
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
  const tileTone = getPosTableTileTone(tileVisualState);
  const statusLabel = isSelected
    ? messages.pos.tableGate.selected
    : tileVisualState === "empty"
      ? messages.pos.tableGate.available
      : tileVisualState === "ready"
        ? messages.pos.tableGate.ready
        : tileVisualState === "served"
          ? messages.pos.tableGate.served
          : tileVisualState === "active"
            ? messages.pos.tableGate.occupied
            : messages.pos.tableGate.reserved;

  return (
    <OperationalTile
      type="button"
      selected={isSelected}
      tone={tileTone}
      size="tile"
      aria-label={`${messages.pos.tableGate.tableAria(table.number, statusLabel)}${hasStaffCall ? `, ${SELF_ORDER_VI.staffCallBadge}` : ""}${hasPendingSelfOrderRequest ? ", QR đang chờ duyệt" : ""}`}
      className={cn(
        "w-full min-w-0 flex-col items-stretch justify-start gap-2 p-3 text-left whitespace-normal hover:shadow-effect-card-hover sm:gap-3 lg:p-4",
        tileVisualState === "ready" && !isSelected && "bg-success/20",
      )}
      onClick={handleClick}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-60">
          {TABLE_VI.long}
        </p>
        <Badge
          variant={
            isSelected
              ? "outline"
              : tileTone === "success"
                ? "success"
                : tileTone === "warning"
                  ? "warning"
                  : "secondary"
          }
          className={cn(
            "min-w-0 truncate text-xs font-semibold",
            isSelected &&
              "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground",
          )}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none tabular-nums">
          {table.number}
        </p>
        {hasStaffCall ? (
          <Badge variant="warning" className="w-fit text-xs font-semibold">
            {SELF_ORDER_VI.staffCallBadge}
          </Badge>
        ) : hasPendingSelfOrderRequest ? (
          <Badge variant="warning" className="w-fit text-xs font-semibold">
            QR ⏳
          </Badge>
        ) : orderCount >= 2 ? (
          <Badge variant="secondary" className="w-fit text-xs font-semibold">
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
