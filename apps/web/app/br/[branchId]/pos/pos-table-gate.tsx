"use client";

import { useMemo } from "react";
import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { UtensilsCrossed, Package, LayoutGrid } from "lucide-react";
import type { OrderType } from "./types";
import type { BranchTable } from "./page";

interface PosTableGateProps {
  tables: BranchTable[];
  orderType: OrderType;
  onOrderTypeChange: (type: OrderType) => void;
  selectedTableId: number | null;
  onTableSelect: (tableId: number | null) => void;
}

export function PosTableGate({
  tables,
  orderType,
  onOrderTypeChange,
  selectedTableId,
  onTableSelect,
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
    <div className="flex flex-1 flex-col overflow-hidden bg-muted/20">
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2 text-primary">
          <LayoutGrid className="size-6 shrink-0" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              Chọn bàn
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Chọn tại bàn hoặc mang về, sau đó chọn bàn để mở thực đơn.
            </p>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Loại đơn hàng"
          className="mt-4 flex max-w-md gap-1 rounded-lg bg-muted p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={orderType === "dine_in"}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              orderType === "dine_in"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onOrderTypeChange("dine_in")}
          >
            <UtensilsCrossed className="size-4" />
            Tại bàn
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={orderType === "takeaway"}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              orderType === "takeaway"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onOrderTypeChange("takeaway")}
          >
            <Package className="size-4" />
            Mang về
          </button>
        </div>
      </div>

      {orderType === "takeaway" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <Package className="size-14 text-muted-foreground/40" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Mang về không cần chọn bàn. Thực đơn hiển thị bên trái — thêm món
            vào giỏ rồi đặt món.
          </p>
        </div>
      ) : tables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-sm text-muted-foreground">
            Chưa có bàn nào trong chi nhánh. Liên hệ quản lý để thiết lập.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4 sm:p-6">
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

      {orderType === "dine_in" && (
        <div className="border-t bg-background px-4 py-3 sm:px-6">
          <p className="text-center text-xs text-muted-foreground">
            {selectedTableId == null
              ? "Chọn một bàn trống để mở thực đơn và đặt món."
              : "Đã chọn bàn — thực đơn sẽ hiển thị bên cạnh."}
          </p>
        </div>
      )}
    </div>
  );
}
