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

import { TABLE_VI } from "@comtammatu/shared/messages";
interface PosTableGateProps {
  tables: BranchTable[];
  selectedTableId: number | null;
  onTableSelect: (table: BranchTable) => void;
  /** Map<table_id, count of active orders on that table> for multi-order indicator */
  orderCountByTable?: Map<number, number>;
  className?: string;
}

interface TableButtonProps {
  table: BranchTable;
  isSelected: boolean;
  orderCount: number;
  onTableSelect: (table: BranchTable) => void;
}

const TableButton = memo(function TableButton({
  table,
  isSelected,
  orderCount,
  onTableSelect,
}: TableButtonProps) {
  const handleClick = useCallback(
    () => onTableSelect(table),
    [onTableSelect, table],
  );
  const isAvailable = table.status === "available";
  const isOccupied = table.status === "occupied";
  const statusLabel = isSelected
    ? messages.pos.tableGate.selected
    : isAvailable
      ? messages.pos.tableGate.available
      : isOccupied
        ? messages.pos.tableGate.occupied
        : messages.pos.tableGate.reserved;

  return (
    <Button
      type="button"
      variant={isSelected ? "default" : "outline"}
      size="touch"
      aria-label={messages.pos.tableGate.tableAria(table.number, statusLabel)}
      className={cn(
        "aspect-square w-full min-w-0 flex-col items-stretch justify-start gap-1.5 p-2 text-left whitespace-normal hover:shadow-md sm:gap-2 sm:p-2.5 lg:gap-3 lg:p-3",
        isSelected
          ? "shadow-md"
          : isAvailable
            ? "bg-card shadow-sm hover:border-primary/25"
            : isOccupied
              ? "bg-warning/10 text-foreground shadow-sm hover:border-warning/35"
              : "bg-muted/55 text-muted-foreground shadow-sm hover:border-border",
      )}
      onClick={handleClick}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-60">
          {TABLE_VI.long}
        </p>
        <Badge
          variant={
            isSelected
              ? "outline"
              : isAvailable
                ? "success"
                : isOccupied
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
        <p className="font-mono text-2xl font-semibold leading-none tabular-nums sm:text-3xl">
          {table.number}
        </p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-xs font-semibold tabular-nums opacity-80 sm:text-sm">
            {messages.pos.tableGate.capacity(table.capacity)}
          </p>
          {orderCount >= 2 && (
            <Badge variant="secondary" className="w-fit text-xs font-semibold">
              {messages.pos.tableGate.multiBill(orderCount)}
            </Badge>
          )}
        </div>
      </div>
    </Button>
  );
});

function PosTableGateComponent({
  tables,
  selectedTableId,
  onTableSelect,
  orderCountByTable,
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
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex w-full flex-col gap-3 px-2 pb-28 pt-2 md:gap-4 md:px-4 md:py-4 lg:px-5">
            {tableGroups.map(({ zoneName, zoneTables, availableCount }) => (
              <section key={zoneName} className="flex flex-col gap-3 md:gap-4">
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

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6">
                  {zoneTables.map((table) => (
                    <TableButton
                      key={table.id}
                      table={table}
                      isSelected={selectedTableId === table.id}
                      orderCount={orderCountByTable?.get(table.id) ?? 0}
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
