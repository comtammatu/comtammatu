"use client";

import { useMemo } from "react";
import { cn } from "@comtammatu/ui";
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
  const selectionProgress = selectedTableId == null ? 52 : 100;
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
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20",
        className,
      )}
    >
      <div className="border-b border-border/60 bg-background px-4 py-4 sm:px-6">
        <div className="ui-flow-panel rounded-4xl p-5">
          <div className="relative space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <LayoutGrid className="size-5" />
                  <p className="app-section-label">Ngữ cảnh phục vụ</p>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  Chọn đúng bàn trước khi bắt đầu đơn tại chỗ.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Chạm đúng bàn để menu và giỏ hàng vào đúng ngữ cảnh phục vụ. Nếu khách mang về, đổi sang chế độ mang về ở khu điều phối đơn.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="ui-surface-lift rounded-3xl border border-border/60 bg-white/82 p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bàn trống
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {availableCount}
                  </p>
                </div>
                <div className="ui-surface-lift rounded-3xl border border-border/60 bg-white/82 p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Đang sử dụng
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {occupiedCount}
                  </p>
                </div>
                <div className="ui-surface-lift rounded-3xl border border-primary/20 bg-primary/8 p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Bàn đang chọn
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {selectedTable != null
                      ? `Bàn ${selectedTable.number}`
                      : "Chưa chọn"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                <span>Bước 2, khóa ngữ cảnh bàn</span>
                <span>
                  {selectedTableId == null
                    ? "Đang chờ chọn bàn"
                    : "Sẵn sàng mở menu"}
                </span>
              </div>
              <div className="ui-flow-progress">
                <div
                  className="ui-flow-progress-bar"
                  style={{ width: `${selectionProgress}%` }}
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="ui-flow-step" data-state="done">
                <div className="flex items-start gap-3">
                  <div className="ui-flow-stage-index">1</div>
                  <div>
                    <p className="text-sm font-semibold">Chế độ phục vụ</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Đơn tại chỗ cần gán đúng bàn trước khi thêm món.
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="ui-flow-step"
                data-state={selectedTableId == null ? "current" : "done"}
              >
                <div className="flex items-start gap-3">
                  <div className="ui-flow-stage-index">2</div>
                  <div>
                    <p className="text-sm font-semibold">Chọn bàn đang phục vụ</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Hệ thống sẽ đưa menu và giỏ hàng vào đúng bàn.
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="ui-flow-step"
                data-state={selectedTableId == null ? "todo" : "done"}
              >
                <div className="flex items-start gap-3">
                  <div className="ui-flow-stage-index">3</div>
                  <div>
                    <p className="text-sm font-semibold">Bắt đầu lên món</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Menu mở ngay khi bàn hợp lệ được chọn.
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
          <div className="ui-content-auto mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
            {Array.from(tablesByZone.entries()).map(([zoneName, zoneTables]) => (
              <section key={zoneName} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <MapPinned className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {zoneName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {zoneTables.length} bàn trong khu này
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-border/70 bg-white/82 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {
                      zoneTables.filter((table) => table.status === "available")
                        .length
                    }{" "}
                    bàn trống
                  </span>
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
                            : `Bàn ${String(table.number)} — đang sử dụng`
                        }
                        className={cn(
                          "ui-surface-lift flex min-h-28 flex-col items-start justify-between rounded-3xl border p-4 text-left transition-all",
                          isSelected
                            ? "border-primary/30 bg-primary text-primary-foreground shadow-md"
                            : isAvailable
                              ? "border-border/70 bg-card/92 shadow-sm hover:border-primary/25 hover:bg-white"
                              : "cursor-not-allowed border-border/50 bg-muted/55 text-muted-foreground/65",
                        )}
                        onClick={() => onTableSelect(isSelected ? null : table.id)}
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                              Bàn
                            </p>
                            <p className="mt-1 text-2xl font-black leading-none tabular-nums">
                              {table.number}
                            </p>
                          </div>
                          <div
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              isSelected
                                ? "bg-primary-foreground/15 text-primary-foreground"
                                : isAvailable
                                  ? "bg-success/10 text-success"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {isSelected
                              ? "Đang chọn"
                              : isAvailable
                                ? "Sẵn sàng"
                                : "Đang dùng"}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Armchair className="size-4" />
                            <span>{table.capacity} chỗ</span>
                          </div>
                          <p
                            className={cn(
                              "text-xs leading-5",
                              isSelected
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {isAvailable
                              ? "Chạm để gán bàn cho đơn này."
                              : "Bàn đang có khách hoặc đang bảo trì."}
                          </p>
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

      <div className="border-t border-border/60 bg-background px-4 py-3 sm:px-6">
        <p className="text-center text-xs text-muted-foreground">
          {selectedTableId == null
            ? "Chạm một bàn trống để tiếp tục mở menu."
            : "Đã khóa ngữ cảnh bàn, quay lại menu để thêm món."}
        </p>
      </div>
    </div>
  );
}
