"use client";

import React, { useState, useTransition } from "react";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { fetchFoodCost } from "../accounting-actions";
import type { FoodCostRow } from "./page";

interface Props {
  initialRows: FoodCostRow[];
  initialStart: string;
  initialEnd: string;
}

export function FoodCostClient({
  initialRows,
  initialStart,
  initialEnd,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFilter() {
    setError(null);
    startTransition(async () => {
      const res = await fetchFoodCost({ startDate, endDate });
      if (!res.success) {
        setError(res.error ?? "Lỗi không xác định");
        return;
      }
      setRows((res.data ?? []) as FoodCostRow[]);
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.food_cost ?? 0), 0);
  const avgMargin =
    totalRevenue > 0
      ? (((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(1)
      : "—";

  const margin = (r: FoodCostRow) => {
    const rev = r.revenue ?? 0;
    const cost = r.food_cost ?? 0;
    if (rev === 0) return "—";
    return `${(((rev - cost) / rev) * 100).toFixed(1)}%`;
  };

  const marginColor = (r: FoodCostRow) => {
    const rev = r.revenue ?? 0;
    const cost = r.food_cost ?? 0;
    if (rev === 0) return "";
    const pct = ((rev - cost) / rev) * 100;
    if (pct >= 60) return "text-success";
    if (pct >= 40) return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            className="w-40"
            value={startDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setStartDate(e.target.value)
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            className="w-40"
            value={endDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEndDate(e.target.value)
            }
          />
        </div>
        <Button onClick={handleFilter} disabled={isPending} size="sm">
          {isPending ? "Đang tải..." : "Lọc"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="px-4 py-5">
            <p className="text-xs text-muted-foreground">Tổng doanh thu</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {totalRevenue.toLocaleString("vi-VN")} ₫
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5">
            <p className="text-xs text-muted-foreground">Tổng food cost</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {totalCost.toLocaleString("vi-VN")} ₫
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5">
            <p className="text-xs text-muted-foreground">Biên lợi nhuận TB</p>
            <p className="mt-1 text-xl font-bold">{avgMargin}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="px-4 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Món</TableHead>
                <TableHead className="w-24 text-right">SL bán</TableHead>
                <TableHead className="w-36 text-right">Doanh thu (₫)</TableHead>
                <TableHead className="w-36 text-right">Food cost (₫)</TableHead>
                <TableHead className="w-24 text-right">Biên lãi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Không có dữ liệu trong khoảng thời gian này.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.item_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(r.qty_sold ?? 0).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(r.revenue ?? 0).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(r.food_cost ?? 0).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${marginColor(r)}`}
                    >
                      {margin(r)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
