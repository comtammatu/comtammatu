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
  grossMarginPct: number | null;
}

const foodCopy = messages.finance.foodCost;
const filterCopy = messages.finance.filterBar;
const dash = messages.finance.common.noValue;
const notCalculated = messages.finance.basic.kpis.notCalculated;

const MARGIN_GREEN = 60;
const MARGIN_WARN = 40;
const MONEY_COL = "text-right whitespace-nowrap";
const COUNT_COL = "w-16 text-right font-mono tabular-nums whitespace-nowrap";

function marginKpiTone(
  pct: number | null,
): "warning" | "success" | "destructive" {
  if (pct == null) return "warning";
  if (pct >= MARGIN_GREEN) return "success";
  if (pct >= MARGIN_WARN) return "warning";
  return "destructive";
}

function formatCostAmount(value: number | null | undefined): ReactNode {
  if (value == null) return dash;
  return <FinanceAmountCell amount={Number(value)} />;
}

function formatMarginPct(value: number | null | undefined): ReactNode {
  if (value == null) return dash;
  return formatPercent(Number(value));
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

function MarginCell({
  profit,
  marginPct,
}: {
  profit: number | null | undefined;
  marginPct: number | null | undefined;
}) {
  return (
    <div className="flex flex-col items-end gap-1 leading-tight text-right">
      {formatCostAmount(profit)}
      <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
        {formatMarginPct(marginPct)}
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
  grossMarginPct,
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
  const tableTitleBadge = totals.incomplete
    ? foodCopy.tableIncompleteHint
    : foodCopy.itemCount(formatCount(rows.length));
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
        row.item_name ?? dash,
        Number(row.quantity_sold ?? 0),
        Math.round(Number(row.revenue ?? 0)),
        row.unit_ingredient_cost == null
          ? dash
          : Math.round(Number(row.unit_ingredient_cost)),
        row.ingredient_cost == null
          ? dash
          : Math.round(Number(row.ingredient_cost)),
        row.gross_profit == null ? dash : Math.round(Number(row.gross_profit)),
        row.gross_margin_pct == null
          ? dash
          : formatPercent(Number(row.gross_margin_pct)),
      ]),
    },
  ];

  const columns: DataTableColumn<FoodCostRow>[] = [
    {
      key: "item",
      header: PRODUCT_VI.posItem,
      className: "min-w-40",
      sortable: true,
      sortValue: (row) => row.item_name ?? "",
      render: (row) => row.item_name ?? dash,
    },
    {
      key: "quantity_sold",
      header: foodCopy.quantitySold,
      className: COUNT_COL,
      sortable: true,
      sortValue: (row) => Number(row.quantity_sold ?? 0),
      render: (row) => formatCount(Number(row.quantity_sold ?? 0)),
    },
    {
      key: "revenue",
      header: foodCopy.revenueCurrency,
      className: MONEY_COL,
      sortable: true,
      sortValue: (row) => Number(row.revenue ?? 0),
      render: (row) => formatCostAmount(row.revenue ?? 0),
    },
    {
      key: "food_cost",
      header: foodCopy.foodCostCurrency,
      className: MONEY_COL,
      sortable: true,
      sortValue: (row) => Number(row.ingredient_cost ?? 0),
      render: (row) => (
        <RecipeCostCell
          total={row.ingredient_cost}
          unit={row.unit_ingredient_cost}
        />
      ),
    },
    {
      key: "gross_profit",
      header: foodCopy.grossProfitCurrency,
      className: MONEY_COL,
      sortable: true,
      sortValue: (row) => Number(row.gross_profit ?? 0),
      render: (row) => (
        <MarginCell
          profit={row.gross_profit}
          marginPct={row.gross_margin_pct}
        />
      ),
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
          key: "gross_profit",
          content: (
            <MarginCell
              profit={totals.grossProfit}
              marginPct={totals.grossMarginPct}
            />
          ),
          className: `${MONEY_COL} font-semibold`,
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* DASHBOARD_REPORT: non-sticky FilterBar above KPI — never wrap in AppListFrame. */}
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/food-cost"
        hide={["branch", "compare", "granularity"]}
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
        className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 sm:max-w-2xl"
      >
        <KpiCard
          density="compact"
          label={foodCopy.actualFoodCost}
          value={formatVND(actualFoodCost)}
          shortValue={formatCompactVND(actualFoodCost)}
          tone="primary"
        />
        <KpiCard
          density="compact"
          label={foodCopy.grossMargin}
          value={
            grossMarginPct == null
              ? notCalculated
              : formatPercent(grossMarginPct)
          }
          tone={marginKpiTone(grossMarginPct)}
        />
      </KpiRow>

      <AppSection
        size="sm"
        title={foodCopy.tableTitle}
        badge={{
          children: tableTitleBadge,
          variant: totals.incomplete ? "warning" : "secondary",
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
          defaultSortKey="revenue"
          defaultSortDirection="desc"
          pageSize={50}
          emptyMode="no-results"
          emptyTitle={foodCopy.emptyTitle}
          desktopFooterRows={rows.length > 0 ? footerRows : undefined}
          mobileFooter={
            rows.length > 0 ? (
              <Frame className="flex flex-col gap-1 bg-muted/30 p-3 text-sm">
                <div className="font-medium">{foodCopy.tableTotal}</div>
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
                <MetricPair
                  label={foodCopy.grossProfitCurrency}
                  value={
                    <MarginCell
                      profit={totals.grossProfit}
                      marginPct={totals.grossMarginPct}
                    />
                  }
                />
              </Frame>
            ) : null
          }
          mobileCardRender={(row) => (
            <Item variant="outline" size="sm">
              <ItemHeader>
                <ItemTitle className="min-w-0 break-words">
                  {row.item_name ?? dash}
                </ItemTitle>
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
                <MetricPair
                  label={foodCopy.grossProfitCurrency}
                  value={
                    <MarginCell
                      profit={row.gross_profit}
                      marginPct={row.gross_margin_pct}
                    />
                  }
                />
              </ItemContent>
            </Item>
          )}
        />
      </AppSection>
    </div>
  );
}
