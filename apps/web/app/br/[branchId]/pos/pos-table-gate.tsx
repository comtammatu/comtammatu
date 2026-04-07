"use client";

import { useMemo } from "react";
import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { LayoutGrid } from "lucide-react";
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
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20",
        className,
      )}
    >
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2 text-primary">
          <LayoutGrid className="size-6 shrink-0" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              Chọn bàn
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Chọn một bàn trống để mở thực đơn. Khách mang đi — chọn{" "}
              <span className="font-medium text-foreground">Mang về</span> ở
              thanh trên.
            </p>
          </div>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-sm text-muted-foreground">
            Chưa có bàn nào trong chi nhánh. Liên hệ quản lý để thiết lập.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
            {Array.from(tablesByZone.entries()).map(
              ([zoneName, zoneTables]) => (
                <div key={zoneName}>
                  {tablesByZone.size > 1 && (
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {zoneName}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
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
                              : `Bàn ${String(table.number)} — đang sử dụng`
                          }
                          className={cn(
                            "flex min-h-[52px] min-w-[52px] flex-col items-center justify-center rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : isAvailable
                                ? "border-border bg-card hover:border-primary/50 hover:bg-accent"
                                : "cursor-not-allowed border-border/50 bg-muted/50 text-muted-foreground/50",
                          )}
                          onClick={() =>
                            onTableSelect(isSelected ? null : table.id)
                          }
                        >
                          <span>{table.number}</span>
                          {table.capacity > 0 && (
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {table.capacity} chỗ
                            </span>
                          )}
                          {!isAvailable && (
                            <span className="text-[10px] text-destructive">
                              Đang dùng
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
          </div>
        </ScrollArea>
      )}

      <div className="border-t bg-background px-4 py-3 sm:px-6">
        <p className="text-center text-xs text-muted-foreground">
          {selectedTableId == null
            ? "Chạm bàn trống để gán bàn và mở thực đơn."
            : "Đã chọn bàn — thực đơn và giỏ hàng sẽ mở."}
        </p>
      </div>
    </div>
  );
}
