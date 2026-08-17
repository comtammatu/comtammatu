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
}

const foodCopy = messages.finance.foodCost;
const filterCopy = messages.finance.filterBar;

const MARGIN_GREEN = 60;
const MARGIN_WARN = 40;

function marginPct(row: FoodCostRow): number | null {
  return row.gross_margin_pct == null ? null : Number(row.gross_margin_pct);
}

function marginToneClass(pct: number | null): string {
  if (pct == null) return "";
  if (pct >= MARGIN_GREEN) return "text-success";
  if (pct >= MARGIN_WARN) return "text-warning";
  return "text-destructive";
}

function formatCostAmount(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatVND(Number(value));
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
        row.item_name ?? "—",
        Number(row.quantity_sold ?? 0),
        Math.round(Number(row.revenue ?? 0)),
        row.unit_ingredient_cost == null
          ? "—"
          : Math.round(Number(row.unit_ingredient_cost)),
        row.ingredient_cost == null
          ? "—"
          : Math.round(Number(row.ingredient_cost)),
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
      className: "w-20 text-right font-mono tabular-nums",
      render: (row) => formatCount(Number(row.quantity_sold ?? 0)),
    },
    {
      key: "revenue",
      header: foodCopy.revenueCurrency,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(Number(row.revenue ?? 0)),
    },
    {
      key: "unit_food_cost",
      header: foodCopy.unitFoodCostCurrency,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatCostAmount(row.unit_ingredient_cost),
    },
    {
      key: "food_cost",
      header: foodCopy.foodCostCurrency,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatCostAmount(row.ingredient_cost),
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
          tone="primary"
        />
      </KpiRow>

      <AppSection
        title={foodCopy.tableTitle}
        description={foodCopy.description}
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
          mobileCardRender={(row) => {
            const pct = marginPct(row);
            return (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{row.item_name ?? "—"}</ItemTitle>
                  <ItemDescription>
                    {foodCopy.quantitySold}{" "}
                    {formatCount(Number(row.quantity_sold ?? 0))} ·{" "}
                    {formatVND(Number(row.revenue ?? 0))}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <span className="text-xs font-medium">
                    {foodCopy.unitFoodCostCurrency}{" "}
                    {formatCostAmount(row.unit_ingredient_cost)}
                    {" · "}
                    {foodCopy.foodCostCurrency}{" "}
                    {formatCostAmount(row.ingredient_cost)}
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
