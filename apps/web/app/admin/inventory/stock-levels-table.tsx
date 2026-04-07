"use client";

import { useState, useTransition, useCallback } from "react";
import { AlertTriangle, RefreshCw, Sliders } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { fetchStockLevels } from "./actions";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import type { IngredientRow, BranchOption } from "./page";

interface StockLevelRow {
  id: number;
  ingredient_id: number;
  current_quantity: number;
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
}

export function StockLevelsTable({
  branches,
  defaultBranchId,
}: StockLevelsTableProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    defaultBranchId,
  );
  const [stockRows, setStockRows] = useState<StockLevelRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<StockLevelRow | null>(null);
  const [isPending, startTransition] = useTransition();

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

          {!loaded && selectedBranchId && (
            <Button
              variant="default"
              size="sm"
              onClick={() => loadStock(selectedBranchId)}
              disabled={isPending}
            >
              {isPending ? (
                <RefreshCw className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Tải tồn kho
            </Button>
          )}

          {loaded && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isPending}
              title="Làm mới"
            >
              <RefreshCw
                className={`size-4 ${isPending ? "animate-spin" : ""}`}
              />
              <span className="sr-only">Làm mới</span>
            </Button>
          )}
        </div>

        {loaded && alertCount > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" />
            {alertCount} cảnh báo tồn kho
          </Badge>
        )}
      </div>

      {!selectedBranchId && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Sliders className="size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Chọn chi nhánh để xem tồn kho
          </p>
        </div>
      )}

      {selectedBranchId && !loaded && !isPending && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Nhấn &quot;Tải tồn kho&quot; để xem dữ liệu
          </p>
        </div>
      )}

      {(loaded || isPending) && (
        <div className={`rounded-md border ${isPending ? "opacity-60" : ""}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguyên liệu</TableHead>
                <TableHead className="text-right">Tồn hiện tại</TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  Tối thiểu
                </TableHead>
                <TableHead className="hidden sm:table-cell">Đơn vị</TableHead>
                <TableHead>Cảnh báo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.length === 0 && !isPending && (
                <TableRow>
                  <TableCell
                    colSpan={6}
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
                    className={alertLevel === "low" ? "bg-destructive/5" : ""}
                  >
                    <TableCell className="font-medium">
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
                    <TableCell className="hidden sm:table-cell text-right font-mono text-muted-foreground">
                      {row.min_stock_level.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {row.ingredient_unit}
                    </TableCell>
                    <TableCell>
                      {alertLevel === "low" && (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <AlertTriangle className="size-3" />
                          Thiếu hàng
                        </Badge>
                      )}
                      {alertLevel === "high" && (
                        <Badge variant="secondary" className="text-xs">
                          Tràn kho
                        </Badge>
                      )}
                      {alertLevel === "ok" && (
                        <Badge
                          variant="outline"
                          className="text-xs text-green-600"
                        >
                          Đủ hàng
                        </Badge>
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
          </Table>
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
