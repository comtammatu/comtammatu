"use client";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import { PRODUCT_VI } from "@comtammatu/shared/messages";
import { AppSection, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import { KpiCard } from "@/components/kpi/kpi-card";
import type { FinanceParams } from "../_lib/finance-params";
import type { FoodCostRow } from "./_types";

interface Props {
  params: FinanceParams;
  branches: { id: number; name: string }[];
  rows: FoodCostRow[];
}

const foodCopy = messages.finance.foodCost;

// Margin tone thresholds — kept consistent with existing rule:
//   ≥60% green, 40-60% warn, <40% destructive. The owner Q4 conflict
//   resolution defers per-category thresholds to v2 so we use the
//   global default here.
const MARGIN_GREEN = 60;
const MARGIN_WARN = 40;

function formatCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

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
}: Props) {
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalCost = rows.reduce(
    (s, r) => s + Number(r.ingredient_cost ?? 0),
    0,
  );
  const avgMarginPct =
    totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null;
  const avgMarginTone =
    avgMarginPct == null
      ? "neutral"
      : avgMarginPct >= MARGIN_GREEN
        ? "success"
        : avgMarginPct >= MARGIN_WARN
          ? "warning"
          : "destructive";

  const columns: DataTableColumn<FoodCostRow>[] = [
    {
      key: "item",
      header: PRODUCT_VI.posItem,
      render: (row) => row.item_name ?? "—",
    },
    {
      key: "quantity_sold",
      header: foodCopy.quantitySold,
      className: "w-24 text-right font-mono tabular-nums",
      render: (row) => formatCount(Number(row.quantity_sold ?? 0)),
    },
    {
      key: "revenue",
      header: foodCopy.revenueCurrency,
      className: "w-36 text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.revenue ?? 0)),
    },
    {
      key: "food_cost",
      header: foodCopy.foodCostCurrency,
      className: "w-36 text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.ingredient_cost ?? 0)),
    },
    {
      key: "margin",
      header: foodCopy.margin,
      className: "w-24 text-right font-medium",
      render: (row) => {
        const pct = marginPct(row);
        return (
          <span className={marginToneClass(pct)}>
            {pct == null ? "—" : `${pct.toFixed(1)}%`}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/food-cost"
        hide={["compare", "payment", "granularity"]}
      />

      <KpiRow>
        <KpiCard
          label={foodCopy.totalFoodCost}
          value={formatVND(totalCost)}
          hint={
            totalRevenue > 0
              ? foodCopy.shareOfRevenueHint(
                  ((totalCost / totalRevenue) * 100).toFixed(1),
                )
              : "—"
          }
        />
        <KpiCard
          label={foodCopy.averageMargin}
          value={avgMarginPct == null ? "—" : `${avgMarginPct.toFixed(1)}%`}
          hint={foodCopy.marginThresholdHint(MARGIN_GREEN, MARGIN_WARN)}
          tone={avgMarginTone}
        />
      </KpiRow>

      <AppSection contentFlush contentScroll>
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) =>
            [
              row.period_start ?? "period",
              row.branch_id ?? "branch",
              row.menu_item_id ?? row.item_name ?? "item",
            ].join(":")
          }
          emptyMode="no-results"
          emptyTitle={foodCopy.emptyTitle}
          emptyDescription={foodCopy.emptyDescription}
          mobileCardRender={(row) => {
            const pct = marginPct(row);
            return (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{row.item_name ?? "—"}</ItemTitle>
                  <ItemDescription>
                    {foodCopy.quantitySold}:{" "}
                    {formatCount(Number(row.quantity_sold ?? 0))}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <span className="text-xs text-muted-foreground">
                    {formatVND(Number(row.ingredient_cost ?? 0))}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${marginToneClass(pct)}`}
                  >
                    {pct == null ? "—" : `${pct.toFixed(1)}%`}
                  </span>
                </ItemFooter>
              </Item>
            );
          }}
        />
      </AppSection>
    </>
  );
}
