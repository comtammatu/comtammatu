"use client";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  formatAccountingVND as formatVND,
  formatCompactVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import { PRODUCT_VI } from "@comtammatu/shared/messages";
import { AppSection, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import {
  FinanceExportActions,
  type CsvSection,
} from "../components/export-toolbar";
import { KpiCard } from "@/components/kpi/kpi-card";
import { getPresetRange, type FinanceParams } from "../_lib/finance-params";
import type { FoodCostRow } from "./_types";

interface Props {
  params: FinanceParams;
  branches: { id: number; name: string }[];
  rows: FoodCostRow[];
  actualFoodCost: number;
  coveredOrderCount: number;
  totalOrderCount: number;
}

const foodCopy = messages.finance.foodCost;
const filterCopy = messages.finance.filterBar;

// Margin tone thresholds — kept consistent with existing rule:
//   ≥60% green, 40-60% warn, <40% destructive. The owner Q4 conflict
//   resolution defers per-category thresholds to v2 so we use the
//   global default here.
const MARGIN_GREEN = 60;
const MARGIN_WARN = 40;

function marginPct(r: FoodCostRow): number | null {
  return r.gross_margin_pct == null ? null : Number(r.gross_margin_pct);
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
  actualFoodCost,
  coveredOrderCount,
  totalOrderCount,
}: Props) {
  const range = getPresetRange(params.range, new Date(), {
    from: params.from,
    to: params.to,
  });
  const branchLabel =
    params.branch == null
      ? messages.finance.common.allBranches
      : (branches.find((branch) => branch.id === params.branch)?.name ??
        messages.finance.common.branchFallback(params.branch));
  const csvFilename = `gia-von-mon_${range.start}_${range.end}.csv`;
  const csvSections: CsvSection[] = [
    {
      title: foodCopy.tableTitle,
      header: [
        PRODUCT_VI.posItem,
        foodCopy.quantitySold,
        foodCopy.revenueCurrency,
        foodCopy.unitFoodCostCurrency,
        foodCopy.foodCostCurrency,
        foodCopy.grossProfitCurrency,
        foodCopy.grossMargin,
      ],
      rows: rows.map((row) => [
        row.item_name ?? "—",
        Number(row.quantity_sold ?? 0),
        Math.round(Number(row.revenue ?? 0)),
        Math.round(Number(row.unit_ingredient_cost ?? 0)),
        Math.round(Number(row.ingredient_cost ?? 0)),
        Math.round(Number(row.gross_profit ?? 0)),
        marginPct(row) == null ? "—" : Number(marginPct(row)?.toFixed(2)),
      ]),
    },
  ];

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
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.revenue ?? 0)),
    },
    {
      key: "unit_cost",
      header: foodCopy.unitFoodCostCurrency,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.unit_ingredient_cost ?? 0)),
    },
    {
      key: "food_cost",
      header: foodCopy.foodCostCurrency,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.ingredient_cost ?? 0)),
    },
    {
      key: "gross_profit",
      header: foodCopy.grossProfitCurrency,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.gross_profit ?? 0)),
    },
    {
      key: "margin",
      header: foodCopy.grossMargin,
      className: "w-24 text-right font-mono tabular-nums",
      render: (row) => {
        const pct = marginPct(row);
        return (
          <span className={marginToneClass(pct)}>
            {pct == null ? "—" : formatPercent(pct)}
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
        hide={["compare", "granularity"]}
        trailing={
          <FinanceExportActions
            filename={csvFilename}
            signature={{
              branchLabel,
              rangeLabel: `${range.start} → ${range.end}`,
              granularityLabel: filterCopy.granularityDay,
            }}
            sections={csvSections}
            disabled={rows.length === 0}
          />
        }
      />

      <KpiRow density="compact">
        <KpiCard
          label={foodCopy.actualFoodCost}
          value={formatVND(actualFoodCost)}
          shortValue={formatCompactVND(actualFoodCost)}
          hint={foodCopy.actualFoodCostHint}
          tone={
            totalOrderCount > 0 && coveredOrderCount < totalOrderCount
              ? "warning"
              : "primary"
          }
        />
        <KpiCard
          label={foodCopy.coverage}
          value={foodCopy.coverageValue(
            formatCount(coveredOrderCount),
            formatCount(totalOrderCount),
          )}
          hint={foodCopy.coverageHint}
          tone={
            totalOrderCount > 0 && coveredOrderCount < totalOrderCount
              ? "warning"
              : "success"
          }
        />
      </KpiRow>

      <AppSection
        title={foodCopy.tableTitle}
        badge={{
          children: foodCopy.itemCount(formatCount(rows.length)),
          variant: "secondary",
        }}
        contentFlush
        contentScroll
      >
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
                    {formatCount(Number(row.quantity_sold ?? 0))} ·{" "}
                    {foodCopy.revenueCurrency}:{" "}
                    {formatVND(Number(row.revenue ?? 0))}
                  </ItemDescription>
                  <ItemDescription>
                    {foodCopy.unitFoodCostCurrency}:{" "}
                    {formatVND(Number(row.unit_ingredient_cost ?? 0))} ·{" "}
                    {foodCopy.foodCostCurrency}:{" "}
                    {formatVND(Number(row.ingredient_cost ?? 0))}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <span className="text-xs font-medium">
                    {foodCopy.grossProfitCurrency}:{" "}
                    {formatVND(Number(row.gross_profit ?? 0))}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${marginToneClass(pct)}`}
                  >
                    {pct == null ? "—" : formatPercent(pct)}
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
