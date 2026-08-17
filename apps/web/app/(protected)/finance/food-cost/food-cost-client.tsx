"use client";

import type { ReactNode } from "react";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemContent,
  ItemHeader,
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
  type DataTableFooterRow,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import {
  FinanceExportActions,
  type CsvSection,
} from "../components/export-toolbar";
import { FinanceAmountCell } from "../components/finance-amount-cell";
import { KpiCard } from "@/components/kpi/kpi-card";
import { summarizeFoodCostRows } from "@/_lib/food-cost-calculation";
import { getPresetRange, type FinanceParams } from "../_lib/finance-params";
import type { FoodCostRow } from "./_types";

interface Props {
  params: FinanceParams;
  branches: { id: number; name: string }[];
  rows: FoodCostRow[];
  actualFoodCost: number;
}

const foodCopy = messages.finance.foodCost;
const filterCopy = messages.finance.filterBar;
const dash = messages.finance.common.noValue;

const MARGIN_GREEN = 60;
const MARGIN_WARN = 40;
const MONEY_COL = "text-right whitespace-nowrap";
const COUNT_COL = "w-16 text-right font-mono tabular-nums whitespace-nowrap";
const MARGIN_COL =
  "w-20 text-right font-mono tabular-nums whitespace-nowrap";

function marginPct(row: FoodCostRow): number | null {
  return row.gross_margin_pct == null ? null : Number(row.gross_margin_pct);
}

function marginToneClass(pct: number | null): string {
  if (pct == null) return "";
  if (pct >= MARGIN_GREEN) return "text-success";
  if (pct >= MARGIN_WARN) return "text-warning";
  return "text-destructive";
}

function formatCostAmount(value: number | null | undefined): ReactNode {
  if (value == null) return dash;
  return <FinanceAmountCell amount={Number(value)} />;
}

function RecipeCostCell({
  total,
  unit,
}: {
  total: number | null | undefined;
  unit: number | null | undefined;
}) {
  return (
    <div className="flex flex-col items-end gap-1 leading-tight text-right">
      {formatCostAmount(total)}
      <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
        {unit == null
          ? dash
          : foodCopy.unitCostPerPortion(formatVND(Number(unit)))}
      </span>
    </div>
  );
}

function MetricPair({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}

export function FoodCostClient({
  params,
  branches,
  rows,
  actualFoodCost,
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
  const totals = summarizeFoodCostRows(rows);
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
        foodCopy.grossMargin,
      ],
      rows: rows.map((row) => [
        row.item_name ?? dash,
        Number(row.quantity_sold ?? 0),
        Math.round(Number(row.revenue ?? 0)),
        row.unit_ingredient_cost == null
          ? dash
          : Math.round(Number(row.unit_ingredient_cost)),
        row.ingredient_cost == null
          ? dash
          : Math.round(Number(row.ingredient_cost)),
        marginPct(row) == null ? dash : Number(marginPct(row)?.toFixed(2)),
      ]),
    },
  ];

  const columns: DataTableColumn<FoodCostRow>[] = [
    {
      key: "item",
      header: PRODUCT_VI.posItem,
      className: "min-w-40",
      render: (row) => row.item_name ?? dash,
    },
    {
      key: "quantity_sold",
      header: foodCopy.quantitySold,
      className: COUNT_COL,
      render: (row) => formatCount(Number(row.quantity_sold ?? 0)),
    },
    {
      key: "revenue",
      header: foodCopy.revenueCurrency,
      className: MONEY_COL,
      render: (row) => formatCostAmount(row.revenue ?? 0),
    },
    {
      key: "food_cost",
      header: foodCopy.foodCostCurrency,
      className: MONEY_COL,
      render: (row) => (
        <RecipeCostCell
          total={row.ingredient_cost}
          unit={row.unit_ingredient_cost}
        />
      ),
    },
    {
      key: "margin",
      header: foodCopy.grossMargin,
      className: MARGIN_COL,
      render: (row) => {
        const pct = marginPct(row);
        return (
          <span className={marginToneClass(pct)}>
            {pct == null ? dash : formatPercent(pct)}
          </span>
        );
      },
    },
  ];

  const footerRows: DataTableFooterRow[] = [
    {
      key: "total",
      className: "hover:bg-transparent",
      cells: [
        {
          key: "label",
          content: foodCopy.tableTotal,
          className: "font-medium",
        },
        {
          key: "quantity_sold",
          content: formatCount(totals.quantitySold),
          className: `${COUNT_COL} font-medium`,
        },
        {
          key: "revenue",
          content: formatCostAmount(totals.revenue),
          className: `${MONEY_COL} font-medium`,
        },
        {
          key: "food_cost",
          content: (
            <RecipeCostCell
              total={totals.ingredientCost}
              unit={totals.unitIngredientCost}
            />
          ),
          className: `${MONEY_COL} font-semibold`,
        },
        {
          key: "margin",
          content: (
            <span className={marginToneClass(totals.grossMarginPct)}>
              {totals.grossMarginPct == null
                ? dash
                : formatPercent(totals.grossMarginPct)}
            </span>
          ),
          className: `${MARGIN_COL} font-semibold`,
        },
      ],
    },
  ];

  return (
    <>
      {/* DASHBOARD_REPORT: non-sticky FilterBar above KPI — never wrap in AppListFrame. */}
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

      <KpiRow
        density="compact"
        className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 sm:max-w-sm"
      >
        <KpiCard
          density="compact"
          label={foodCopy.actualFoodCost}
          value={formatVND(actualFoodCost)}
          shortValue={formatCompactVND(actualFoodCost)}
          tone="primary"
        />
      </KpiRow>

      <AppSection
        size="sm"
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
            String(row.menu_item_id ?? row.item_name ?? "item")
          }
          emptyMode="no-results"
          emptyTitle={foodCopy.emptyTitle}
          emptyDescription={foodCopy.emptyDescription}
          desktopFooterRows={rows.length > 0 ? footerRows : undefined}
          mobileFooter={
            rows.length > 0 ? (
              <Frame className="flex flex-col gap-1 bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{foodCopy.tableTotal}</span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${marginToneClass(totals.grossMarginPct)}`}
                  >
                    {totals.grossMarginPct == null
                      ? dash
                      : formatPercent(totals.grossMarginPct)}
                  </span>
                </div>
                <MetricPair
                  label={foodCopy.quantitySold}
                  value={formatCount(totals.quantitySold)}
                />
                <MetricPair
                  label={foodCopy.revenueCurrency}
                  value={formatCostAmount(totals.revenue)}
                />
                <MetricPair
                  label={foodCopy.foodCostCurrency}
                  value={
                    <RecipeCostCell
                      total={totals.ingredientCost}
                      unit={totals.unitIngredientCost}
                    />
                  }
                />
              </Frame>
            ) : null
          }
          mobileCardRender={(row) => {
            const pct = marginPct(row);
            return (
              <Item variant="outline" size="sm">
                <ItemHeader>
                  <ItemTitle className="min-w-0 break-words">
                    {row.item_name ?? dash}
                  </ItemTitle>
                  <span
                    className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${marginToneClass(pct)}`}
                  >
                    {pct == null ? dash : formatPercent(pct)}
                  </span>
                </ItemHeader>
                <ItemContent className="gap-1 text-xs">
                  <MetricPair
                    label={foodCopy.quantitySold}
                    value={formatCount(Number(row.quantity_sold ?? 0))}
                  />
                  <MetricPair
                    label={foodCopy.revenueCurrency}
                    value={formatCostAmount(row.revenue ?? 0)}
                  />
                  <MetricPair
                    label={foodCopy.foodCostCurrency}
                    value={
                      <RecipeCostCell
                        total={row.ingredient_cost}
                        unit={row.unit_ingredient_cost}
                      />
                    }
                  />
                </ItemContent>
              </Item>
            );
          }}
        />
      </AppSection>
    </>
  );
}
