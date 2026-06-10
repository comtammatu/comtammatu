"use client";

import { memo, useCallback, useMemo } from "react";
import { AppEmptyState } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { messages } from "@lib/messages";
import {
  LayoutGrid as IconLayoutGrid,
  MapPin as IconMapPin,
} from "lucide-react";
import type { BranchTable } from "./page";
import {
  getPosTableTileVisualState,
  type PosTableOrderVisualState,
} from "./_lib/table-order-visual-state";
import { TABLE_VI } from "@comtammatu/shared/messages";

interface PosTableGateProps {
  tables: BranchTable[];
  selectedTableId: number | null;
  onTableSelect: (table: BranchTable) => void;
  /** Map<table_id, count of active orders on that table> for multi-order indicator */
  orderCountByTable?: Map<number, number>;
  /** Map<table_id, visual state derived from active unpaid orders. */
  tableOrderVisualStateByTable?: Map<number, PosTableOrderVisualState>;
  className?: string;
}

interface TableButtonProps {
  table: BranchTable;
  isSelected: boolean;
  orderCount: number;
  orderVisualState?: PosTableOrderVisualState;
  onTableSelect: (table: BranchTable) => void;
}

const TableButton = memo(function TableButton({
  table,
  isSelected,
  orderCount,
  orderVisualState,
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
  const isSuccessTile =
    tileVisualState === "ready" || tileVisualState === "served";
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
    <Button
      type="button"
      variant={isSelected ? "default" : "outline"}
      aria-label={messages.pos.tableGate.tableAria(table.number, statusLabel)}
      className={cn(
        "h-32 w-full min-w-0 flex-col items-stretch justify-start gap-2 p-2.5 text-left whitespace-normal hover:shadow-md sm:h-36 sm:gap-3 sm:p-3 lg:h-40 lg:p-4 xl:h-44",
        isSelected
          ? "shadow-md"
          : tileVisualState === "empty"
            ? "bg-card shadow-sm hover:border-primary/25"
            : tileVisualState === "ready"
              ? "border-success/35 bg-success/20 text-foreground shadow-sm hover:border-success/50 hover:bg-success/25"
              : tileVisualState === "served"
                ? "bg-success/10 text-foreground shadow-sm hover:border-success/35"
                : tileVisualState === "active"
                  ? "bg-warning/10 text-foreground shadow-sm hover:border-warning/35"
                  : "bg-muted/55 text-muted-foreground shadow-sm hover:border-border",
      )}
      onClick={handleClick}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-60 sm:text-sm">
          {TABLE_VI.long}
        </p>
        <Badge
          variant={
            isSelected
              ? "outline"
              : tileVisualState === "empty"
                ? "success"
                : isSuccessTile
                  ? "success"
                  : tileVisualState === "active"
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
        <p className="text-3xl font-semibold leading-none tabular-nums">
          {table.number}
        </p>
        {orderCount >= 2 && (
          <Badge variant="secondary" className="w-fit text-xs font-semibold">
            {messages.pos.tableGate.multiBill(orderCount)}
          </Badge>
        )}
      </div>
    </Button>
  );
});

function PosTableGateComponent({
  tables,
  selectedTableId,
  onTableSelect,
  orderCountByTable,
  tableOrderVisualStateByTable,
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
      availableCount: zoneTables.filter((table) => table.status === "available")
        .length,
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
          <div className="flex w-full flex-col gap-4 px-2 pb-28 pt-2 md:px-4 md:py-4 lg:px-5">
            {tableGroups.map(({ zoneName, zoneTables, availableCount }) => (
              <section key={zoneName} className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconMapPin className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {zoneName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {messages.pos.tableGate.tableCount(zoneTables.length)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {messages.pos.tableGate.availableCount(availableCount)}
                  </Badge>
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
