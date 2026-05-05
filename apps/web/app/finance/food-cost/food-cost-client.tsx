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
import { formatVND } from "@comtammatu/shared/format";
import { ERRORS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { AppToolbar } from "@/components/surface";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { messages } from "@lib/messages";

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
        setError(res.error ?? ERRORS_VI.unknown);
        return;
      }
      setRows((res.data ?? []) as FoodCostRow[]);
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalCost = rows.reduce(
    (s, r) => s + Number(r.ingredient_cost ?? 0),
    0,
  );
  const avgMargin =
    totalRevenue > 0
      ? (((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(1)
      : "—";

  const margin = (r: FoodCostRow) => {
    const rev = Number(r.revenue ?? 0);
    const cost = Number(r.ingredient_cost ?? 0);
    if (rev === 0) return "—";
    return `${(((rev - cost) / rev) * 100).toFixed(1)}%`;
  };

  const marginColor = (r: FoodCostRow) => {
    const rev = Number(r.revenue ?? 0);
    const cost = Number(r.ingredient_cost ?? 0);
    if (rev === 0) return "";
    const pct = ((rev - cost) / rev) * 100;
    if (pct >= 60) return "text-success";
    if (pct >= 40) return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="space-y-4">
      <AppToolbar className="items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs">{FORM_VI.fromDate}</Label>
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
          <Label className="text-xs">{FORM_VI.toDate}</Label>
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
          {isPending
            ? messages.finance.common.loading
            : messages.finance.common.filter}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </AppToolbar>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="px-4 py-5">
            <p className="text-xs text-muted-foreground">
              {messages.finance.foodCost.totalRevenue}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatVND(totalRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5">
            <p className="text-xs text-muted-foreground">
              {messages.finance.foodCost.totalFoodCost}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatVND(totalCost)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5">
            <p className="text-xs text-muted-foreground">
              {messages.finance.foodCost.averageMargin}
            </p>
            <p className="mt-1 text-xl font-bold">{avgMargin}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto px-4 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{PRODUCT_VI.posItem}</TableHead>
                <TableHead className="w-24 text-right">
                  {messages.finance.foodCost.quantitySold}
                </TableHead>
                <TableHead className="w-36 text-right">
                  {messages.finance.foodCost.revenueCurrency}
                </TableHead>
                <TableHead className="w-36 text-right">
                  {messages.finance.foodCost.foodCostCurrency}
                </TableHead>
                <TableHead className="w-24 text-right">
                  {messages.finance.foodCost.margin}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={5}
                  mode="no-results"
                  title={messages.finance.foodCost.emptyTitle}
                  description={messages.finance.foodCost.emptyDescription}
                />
              ) : (
                rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.item_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.quantity_sold ?? 0).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVND(Number(r.revenue ?? 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVND(Number(r.ingredient_cost ?? 0))}
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
