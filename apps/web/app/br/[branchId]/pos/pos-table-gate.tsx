"use client";

import { memo, useCallback, useMemo } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  LayoutGrid as IconLayoutGrid,
  MapPin as IconMapPin,
} from "lucide-react";
import type { BranchTable } from "./page";

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
    ? "Đang chọn"
    : isAvailable
      ? "Trống"
      : isOccupied
        ? "Đang dùng"
        : "Đã đặt";

  return (
    <Button
      type="button"
      variant={isSelected ? "default" : "outline"}
      aria-label={`Bàn ${String(table.number)} ${statusLabel}`}
      className={cn(
        "@container/table-card h-32 w-full min-w-0 flex-col items-stretch justify-start gap-2 p-2.5 text-left whitespace-normal hover:shadow-md sm:gap-3 sm:p-3.5 @[11rem]/table-card:h-36 @[14rem]/table-card:h-40 @[14rem]/table-card:p-4 @[18rem]/table-card:h-44",
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
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-60 @[9rem]/table-card:text-sm">
          Bàn
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
            "min-w-0 truncate text-[10px] font-semibold @[9rem]/table-card:text-xs",
            isSelected &&
              "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground",
          )}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-2">
        <p className="text-3xl font-black leading-none tabular-nums @[9rem]/table-card:text-4xl @[12rem]/table-card:text-5xl @[16rem]/table-card:text-6xl">
          {table.number}
        </p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-sm font-semibold tabular-nums opacity-80 @[9rem]/table-card:text-base @[14rem]/table-card:text-lg">
            {table.capacity} chỗ
          </p>
          {orderCount >= 2 && (
            <Badge
              variant="secondary"
              className="w-fit text-[10px] font-semibold @[9rem]/table-card:text-xs"
            >
              {orderCount} hóa đơn
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
      const zoneName = table.branch_zones?.name ?? "Không có khu vực";
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
        <Empty className="flex-1">
          <EmptyMedia variant="icon">
            <IconLayoutGrid />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Chưa có bàn</EmptyTitle>
            <EmptyDescription>
              Liên hệ quản lý để thiết lập bàn trước khi bán tại chỗ.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
                        {zoneTables.length} bàn
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{availableCount} trống</Badge>
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2 sm:gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
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
