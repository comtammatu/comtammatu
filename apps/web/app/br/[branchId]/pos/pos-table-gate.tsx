"use client";

import { useMemo } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { IconArmchair, IconLayoutGrid, IconMapPin } from "@tabler/icons-react";
import type { BranchTable } from "./page";

interface PosTableGateProps {
  tables: BranchTable[];
  selectedTableId: number | null;
  onTableSelect: (table: BranchTable) => void;
  className?: string;
}

export function PosTableGate({
  tables,
  selectedTableId,
  onTableSelect,
  className,
}: PosTableGateProps) {
  const availableCount = useMemo(
    () => tables.filter((table) => table.status === "available").length,
    [tables],
  );
  const occupiedCount = useMemo(
    () => tables.filter((table) => table.status === "occupied").length,
    [tables],
  );
  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? null,
    [selectedTableId, tables],
  );
  const tablesByZone = useMemo(() => {
    const map = new Map<string, BranchTable[]>();
    for (const table of tables) {
      const zoneName = table.branch_zones?.name ?? "Không có khu vực";
      const group = map.get(zoneName);
      if (group) group.push(table);
      else map.set(zoneName, [table]);
    }
    return map;
  }, [tables]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <div className="border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconLayoutGrid className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Chọn bàn
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground lg:text-2xl">
                {selectedTable != null
                  ? `Bàn ${selectedTable.number} đã sẵn sàng`
                  : "Chạm bàn để mở menu hoặc đơn đang phục vụ"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{availableCount} bàn trống</Badge>
            <Badge variant="outline">{occupiedCount} đang dùng</Badge>
          </div>
        </div>
      </div>

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
          <div className="flex w-full flex-col gap-6 px-4 pb-32 pt-4 sm:p-6 lg:p-8">
            {Array.from(tablesByZone.entries()).map(([zoneName, zoneTables]) => (
              <section key={zoneName} className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <IconMapPin className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {zoneName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {zoneTables.length} bàn
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {
                      zoneTables.filter((table) => table.status === "available")
                        .length
                    }{" "}
                    trống
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                  {zoneTables.map((table) => {
                    const isAvailable = table.status === "available";
                    const isOccupied = table.status === "occupied";
                    const isSelected = selectedTableId === table.id;
                    const statusLabel = isSelected
                      ? "Đang chọn"
                      : isAvailable
                        ? "Trống"
                        : isOccupied
                          ? "Đang dùng"
                          : "Đã đặt";

                    return (
                      <button
                        key={table.id}
                        type="button"
                        aria-label={`Bàn ${String(table.number)} ${statusLabel}`}
                        className={cn(
                          "flex min-h-32 flex-col items-start justify-between rounded-lg border p-4 text-left transition-transform hover:-translate-y-0.5 hover:shadow-md lg:min-h-36",
                          isSelected
                            ? "border-primary/30 bg-primary text-primary-foreground shadow-md"
                            : isAvailable
                              ? "border-border bg-card shadow-sm hover:border-primary/25"
                              : isOccupied
                                ? "border-warning/25 bg-warning/10 text-foreground shadow-sm hover:border-warning/35"
                                : "border-border/70 bg-muted/55 text-muted-foreground shadow-sm hover:border-border",
                        )}
                        onClick={() => onTableSelect(table)}
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                              Bàn
                            </p>
                            <p className="mt-2 text-3xl font-black leading-none tabular-nums">
                              {table.number}
                            </p>
                          </div>
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
                              "text-xs font-semibold",
                              isSelected &&
                                "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground",
                            )}
                          >
                            {statusLabel}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-base font-medium">
                          <IconArmchair className="size-5" />
                          <span>{table.capacity} chỗ</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
