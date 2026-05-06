"use client";

import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "@comtammatu/shared/format";
import { PRODUCT_VI } from "@comtammatu/shared/messages";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import { KpiCard } from "../components/kpi-card";
import type { FinanceParams } from "../_lib/finance-params";
import type { FoodCostRow } from "./page";

interface Props {
  params: FinanceParams;
  branches: { id: number; name: string }[];
  rows: FoodCostRow[];
  resolvedStart: string;
  resolvedEnd: string;
}

const foodCopy = messages.finance.foodCost;

// Margin tone thresholds — kept consistent with existing rule:
//   ≥60% green, 40-60% warn, <40% destructive. The owner Q4 conflict
//   resolution defers per-category thresholds to v2 so we use the
//   global default here.
const MARGIN_GREEN = 60;
const MARGIN_WARN = 40;

function marginPct(r: FoodCostRow): number | null {
  const rev = Number(r.revenue ?? 0);
  const cost = Number(r.ingredient_cost ?? 0);
  if (rev === 0) return null;
  return ((rev - cost) / rev) * 100;
}

function marginToneClass(pct: number | null): string {
  if (pct == null) return "";
  if (pct >= MARGIN_GREEN) return "text-success";
  if (pct >= MARGIN_WARN) return "text-warning";
  return "text-destructive";
}

export function FoodCostClient({
  params,
  branches,
  rows,
  resolvedStart,
  resolvedEnd,
}: Props) {
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalCost = rows.reduce(
    (s, r) => s + Number(r.ingredient_cost ?? 0),
    0,
  );
  const avgMarginPct =
    totalRevenue > 0
      ? ((totalRevenue - totalCost) / totalRevenue) * 100
      : null;
  const avgMarginTone =
    avgMarginPct == null
      ? "neutral"
      : avgMarginPct >= MARGIN_GREEN
        ? "success"
        : avgMarginPct >= MARGIN_WARN
          ? "warning"
          : "destructive";

  return (
    <div className="space-y-4">
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/food-cost"
        hide={["compare", "payment", "granularity"]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={foodCopy.totalRevenue}
          value={formatVND(totalRevenue)}
          hint={`${resolvedStart} → ${resolvedEnd}`}
          tone="primary"
        />
        <KpiCard
          label={foodCopy.totalFoodCost}
          value={formatVND(totalCost)}
          hint={
            totalRevenue > 0
              ? `${((totalCost / totalRevenue) * 100).toFixed(1)}% / DT`
              : "—"
          }
        />
        <KpiCard
          label={foodCopy.averageMargin}
          value={avgMarginPct == null ? "—" : `${avgMarginPct.toFixed(1)}%`}
          hint={`Thresholds: ≥${MARGIN_GREEN}% xanh · ≥${MARGIN_WARN}% vàng`}
          tone={avgMarginTone}
        />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto px-4 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{PRODUCT_VI.posItem}</TableHead>
                <TableHead className="w-24 text-right">
                  {foodCopy.quantitySold}
                </TableHead>
                <TableHead className="w-36 text-right">
                  {foodCopy.revenueCurrency}
                </TableHead>
                <TableHead className="w-36 text-right">
                  {foodCopy.foodCostCurrency}
                </TableHead>
                <TableHead className="w-24 text-right">
                  {foodCopy.margin}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={5}
                  mode="no-results"
                  title={foodCopy.emptyTitle}
                  description={foodCopy.emptyDescription}
                />
              ) : (
                rows.map((r, i) => {
                  const pct = marginPct(r);
                  return (
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
                        className={`text-right font-medium ${marginToneClass(pct)}`}
                      >
                        {pct == null ? "—" : `${pct.toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
