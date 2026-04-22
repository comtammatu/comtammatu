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
import { Armchair, LayoutGrid, MapPinned } from "lucide-react";
import type { BranchTable } from "./page";

interface PosTableGateProps {
  tables: BranchTable[];
  selectedTableId: number | null;
  onTableSelect: (tableId: number | null) => void;
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
    () => tables.filter((table) => table.status !== "available").length,
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
      <div className="border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutGrid className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Chọn bàn
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {selectedTable != null
                  ? `Bàn ${selectedTable.number} đã sẵn sàng`
                  : "Chạm bàn trống để mở menu"}
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
            <LayoutGrid />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Chưa có bàn</EmptyTitle>
            <EmptyDescription>
              Liên hệ quản lý để thiết lập bàn trước khi bán tại chỗ.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
            {Array.from(tablesByZone.entries()).map(([zoneName, zoneTables]) => (
              <section key={zoneName} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MapPinned className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
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

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {zoneTables.map((table) => {
                    const isAvailable = table.status === "available";
                    const isSelected = selectedTableId === table.id;

                    return (
                      <button
                        key={table.id}
                        type="button"
                        disabled={!isAvailable}
                        aria-label={
                          isAvailable
                            ? `Bàn ${String(table.number)}`
                            : `Bàn ${String(table.number)} đang sử dụng`
                        }
                        className={cn(
                          "flex min-h-24 flex-col items-start justify-between rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-md",
                          isSelected
                            ? "border-primary/30 bg-primary text-primary-foreground shadow-md"
                            : isAvailable
                              ? "border-border bg-card shadow-sm hover:border-primary/25"
                              : "cursor-not-allowed border-border/50 bg-muted/55 text-muted-foreground/65",
                        )}
                        onClick={() => onTableSelect(isSelected ? null : table.id)}
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                              Bàn
                            </p>
                            <p className="mt-1 text-2xl font-black leading-none tabular-nums">
                              {table.number}
                            </p>
                          </div>
                          <Badge
                            variant={
                              isSelected
                                ? "outline"
                                : isAvailable
                                  ? "success"
                                  : "secondary"
                            }
                            className={cn(
                              "text-xs font-semibold",
                              isSelected &&
                                "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground",
                            )}
                          >
                            {isSelected
                              ? "Đang chọn"
                              : isAvailable
                                ? "Trống"
                                : "Đang dùng"}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Armchair className="size-4" />
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
