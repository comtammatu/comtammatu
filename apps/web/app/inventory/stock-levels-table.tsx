"use client";

import {
  useState,
  useTransition,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { formatVND } from "@comtammatu/shared/format";
import { AlertTriangle, RefreshCw, Sliders } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { fetchStockLevels } from "./actions";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import type { IngredientRow, BranchOption } from "./page";
import { EmptyStatePanel } from "../admin/components/empty-state-panel";

interface StockLevelRow {
  id: number;
  ingredient_id: number;
  current_quantity: number;
  avg_unit_cost: number | null;
  last_counted_at: string | null;
  ingredient_name: string;
  ingredient_unit: string;
  min_stock_level: number;
  reorder_point: number | null;
  max_stock_level: number | null;
}

interface StockLevelsTableProps {
  ingredients: IngredientRow[];
  branches: BranchOption[];
  defaultBranchId: number | null;
  /** Hiển thị cột thành tiền (WAC / giá tham chiếu) — cùng phạm vi xem "theo chi nhánh" */
  showLineValue?: boolean;
}

function lineStockValue(
  qty: number,
  avgUnitCost: number | null,
  fallbackUnitCost: number | null,
): number {
  const unit =
    avgUnitCost != null
      ? avgUnitCost
      : fallbackUnitCost != null
        ? fallbackUnitCost
        : 0;
  return qty * unit;
}

export function StockLevelsTable({
  branches,
  defaultBranchId,
  ingredients,
  showLineValue = false,
}: StockLevelsTableProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    defaultBranchId,
  );
  const [stockRows, setStockRows] = useState<StockLevelRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<StockLevelRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const unitCostByIngredientId = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const ing of ingredients) {
      m.set(ing.id, ing.unit_cost);
    }
    return m;
  }, [ingredients]);

  const loadStock = useCallback((branchId: number) => {
    startTransition(async () => {
      const result = await fetchStockLevels(branchId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể tải tồn kho");
        return;
      }

      type RawStockLevel = {
        id: number;
        ingredient_id: number;
        current_quantity: number;
        avg_unit_cost: number | null;
        last_counted_at: string | null;
        ingredients:
          | {
              id: number;
              name: string;
              unit: string;
              min_stock_level: number;
              max_stock_level: number | null;
              is_active: boolean;
            }
          | null
          | unknown;
      };

      const rows: StockLevelRow[] = ((result.data ?? []) as RawStockLevel[])
        .map((sl) => {
          const ing = sl.ingredients as {
            name: string;
            unit: string;
            min_stock_level: number;
            max_stock_level: number | null;
            is_active: boolean;
          } | null;
          return {
            id: sl.id,
            ingredient_id: sl.ingredient_id,
            current_quantity: sl.current_quantity,
            avg_unit_cost: sl.avg_unit_cost,
            last_counted_at: sl.last_counted_at,
            ingredient_name: ing?.name ?? "—",
            ingredient_unit: ing?.unit ?? "",
            min_stock_level: ing?.min_stock_level ?? 0,
            reorder_point: null,
            max_stock_level: ing?.max_stock_level ?? null,
          };
        })
        .sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

      setStockRows(rows);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (defaultBranchId !== null) loadStock(defaultBranchId);
  }, [defaultBranchId, loadStock]);

  function handleBranchChange(value: string) {
    const id = Number(value);
    setSelectedBranchId(id);
    setLoaded(false);
    setStockRows([]);
    loadStock(id);
  }

  function handleRefresh() {
    if (selectedBranchId) loadStock(selectedBranchId);
  }

  function getAlertLevel(row: StockLevelRow): "low" | "high" | "ok" | "none" {
    if (row.current_quantity < row.min_stock_level) return "low";
    if (
      row.max_stock_level !== null &&
      row.current_quantity > row.max_stock_level
    )
      return "high";
    return "ok";
  }

  const alertCount = stockRows.filter((r) => getAlertLevel(r) !== "ok").length;

  const branchStockTotal =
    loaded && showLineValue
      ? stockRows.reduce(
          (sum, row) =>
            sum +
            lineStockValue(
              row.current_quantity,
              row.avg_unit_cost,
              unitCostByIngredientId.get(row.ingredient_id) ?? null,
            ),
          0,
        )
      : null;

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={handleBranchChange}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(loaded || isPending) && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isPending}
              aria-label="Làm mới"
            >
              <RefreshCw
                className={`size-4 ${isPending ? "animate-spin" : ""}`}
              />
            </Button>
          )}
        </div>

        {loaded && alertCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: "var(--md-error-container)",
              color: "var(--md-on-error-container)",
            }}
          >
            <AlertTriangle className="size-3" />
            {alertCount} cảnh báo tồn kho
          </span>
        )}
      </div>

      {!selectedBranchId && (
        <EmptyStatePanel
          className="py-16"
          title="Chọn chi nhánh để xem tồn kho"
          icon={<Sliders className="size-8 text-muted-foreground" />}
        />
      )}

      {(loaded || isPending) && (
        <div
          className={`overflow-hidden rounded-3xl ambient-shadow ${isPending ? "opacity-60" : ""}`}
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          {/* Mobile: card layout */}
          {isMobile ? (
            <div className="divide-y overflow-y-auto max-h-[calc(100vh-18rem)]">
              {stockRows.length === 0 && !isPending && (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    Không có dữ liệu tồn kho cho chi nhánh này
                  </p>
                </div>
              )}
              {stockRows.map((row) => {
                const alertLevel = getAlertLevel(row);
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                      backgroundColor:
                        alertLevel === "low"
                          ? "color-mix(in srgb, var(--md-error-container) 15%, transparent)"
                          : undefined,
                    }}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {row.ingredient_name}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-mono tabular-nums ${alertLevel === "low" ? "text-destructive font-semibold" : ""}`}
                        >
                          {row.current_quantity.toLocaleString("vi-VN")}{" "}
                          {row.ingredient_unit}
                        </span>
                        {alertLevel === "low" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: "var(--md-error-container)",
                              color: "var(--md-on-error-container)",
                            }}
                          >
                            <AlertTriangle className="size-3" />
                            Thiếu
                          </span>
                        )}
                        {alertLevel === "high" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: "var(--md-surface-high)",
                              color: "var(--md-on-surface-variant)",
                            }}
                          >
                            Tràn kho
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs shrink-0"
                      onClick={() => setAdjustTarget(row)}
                    >
                      Điều chỉnh
                    </Button>
                  </div>
                );
              })}
              {showLineValue &&
                branchStockTotal != null &&
                stockRows.length > 0 && (
                  <div className="bg-muted/50 px-4 py-3 text-right font-medium font-mono tabular-nums text-sm">
                    Tổng giá trị: {formatVND(branchStockTotal)}
                  </div>
                )}
            </div>
          ) : (
            /* Desktop: table layout */
            <div className="overflow-y-auto max-h-[calc(100vh-32rem)]">
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow
                    className="hover:bg-transparent"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    }}
                  >
                    <TableHead
                      className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Nguyên liệu
                    </TableHead>
                    <TableHead
                      className="text-right px-4 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Tồn hiện tại
                    </TableHead>
                    <TableHead
                      className="hidden md:table-cell text-right px-4 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Giá vốn TB
                    </TableHead>
                    {showLineValue && (
                      <TableHead
                        className="hidden lg:table-cell text-right px-4 py-4 text-xs font-bold uppercase tracking-widest"
                        style={{ color: "var(--md-outline)" }}
                      >
                        Thành tiền
                      </TableHead>
                    )}
                    <TableHead
                      className="hidden sm:table-cell text-right px-4 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Tối thiểu
                    </TableHead>
                    <TableHead
                      className="hidden sm:table-cell px-4 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Đơn vị
                    </TableHead>
                    <TableHead
                      className="px-4 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Cảnh báo
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.length === 0 && !isPending && (
                    <TableRow>
                      <TableCell
                        colSpan={showLineValue ? 8 : 7}
                        className="py-12 text-center text-sm text-muted-foreground"
                      >
                        Không có dữ liệu tồn kho cho chi nhánh này
                      </TableCell>
                    </TableRow>
                  )}
                  {stockRows.map((row) => {
                    const alertLevel = getAlertLevel(row);
                    return (
                      <TableRow
                        key={row.id}
                        className="group transition-colors"
                        style={{
                          borderColor:
                            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                          backgroundColor:
                            alertLevel === "low"
                              ? "color-mix(in srgb, var(--md-error-container) 15%, transparent)"
                              : undefined,
                        }}
                      >
                        <TableCell className="px-6 py-4 font-medium">
                          {row.ingredient_name}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            alertLevel === "low"
                              ? "text-destructive font-semibold"
                              : ""
                          }`}
                        >
                          {row.current_quantity.toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground text-xs">
                          {row.avg_unit_cost != null
                            ? `${row.avg_unit_cost.toLocaleString("vi-VN")} ₫`
                            : "—"}
                        </TableCell>
                        {showLineValue && (
                          <TableCell className="hidden lg:table-cell text-right font-mono text-sm tabular-nums">
                            {formatVND(
                              lineStockValue(
                                row.current_quantity,
                                row.avg_unit_cost,
                                unitCostByIngredientId.get(row.ingredient_id) ??
                                  null,
                              ),
                            )}
                          </TableCell>
                        )}
                        <TableCell className="hidden sm:table-cell text-right font-mono text-muted-foreground">
                          {row.min_stock_level.toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {row.ingredient_unit}
                        </TableCell>
                        <TableCell className="px-4">
                          {alertLevel === "low" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor: "var(--md-error-container)",
                                color: "var(--md-on-error-container)",
                              }}
                            >
                              <AlertTriangle className="size-3" />
                              Thiếu hàng
                            </span>
                          )}
                          {alertLevel === "high" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor: "var(--md-surface-high)",
                                color: "var(--md-on-surface-variant)",
                              }}
                            >
                              Tràn kho
                            </span>
                          )}
                          {alertLevel === "ok" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor:
                                  "var(--md-secondary-container)",
                                color: "var(--md-on-secondary-container)",
                              }}
                            >
                              Đủ hàng
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setAdjustTarget(row)}
                          >
                            Điều chỉnh
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {showLineValue &&
                  branchStockTotal != null &&
                  stockRows.length > 0 && (
                    <TableFooter>
                      <TableRow
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                          borderColor:
                            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                        }}
                      >
                        <TableCell
                          colSpan={8}
                          className="text-right font-medium font-mono tabular-nums px-6"
                        >
                          Tổng giá trị (chi nhánh đang xem):{" "}
                          {formatVND(branchStockTotal)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
              </Table>
            </div>
          )}
        </div>
      )}

      {adjustTarget && selectedBranchId && (
        <AdjustStockDialog
          open={!!adjustTarget}
          onOpenChange={(open) => !open && setAdjustTarget(null)}
          branchId={selectedBranchId}
          ingredientId={adjustTarget.ingredient_id}
          ingredientName={adjustTarget.ingredient_name}
          unit={adjustTarget.ingredient_unit}
          onAdjusted={() => {
            setAdjustTarget(null);
            loadStock(selectedBranchId);
          }}
        />
      )}
    </>
  );
}
