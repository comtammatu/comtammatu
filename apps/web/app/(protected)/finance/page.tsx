import Link from "next/link";
import { ArrowRight as IconArrowRight } from "lucide-react";
import {
  formatCount,
  formatPercent,
  formatVND,
} from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { FilterBar } from "./components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
  type FinanceRange,
} from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceException,
} from "./_lib/finance-cockpit";
import { fetchCashSummary } from "./_lib/cash-cockpit";
import type { FinanceOverviewSearchParams } from "./_lib/finance-overview-types";
import { CurrentFundsSection } from "./components/current-funds-section";

const financeCopy = messages.finance;
const powerLiteCopy = financeCopy.powerLite;
const HKD_RANGES: readonly FinanceRange[] = ["today", "yesterday", "7d", "mtd"];
function FinanceAttentionSection({
  exceptions,
}: {
  exceptions: FinanceException[];
}) {
  const actionable = exceptions.filter(
    (item): item is FinanceException & { href: string } =>
      item.tone !== "neutral" && item.href != null,
  );
  const needsWork = actionable.length > 0;

  return (
    <AppSection
      size="sm"
      title={powerLiteCopy.ownerNewsTitle}
    >
      {needsWork ? (
        <ItemGroup>
          {actionable.map((item) => (
            <Item
              key={`${item.href}:${item.label}`}
              variant="outline"
              size="sm"
              role="listitem"
              render={<Link href={item.href} />}
            >
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-none">{item.label}</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {item.hint}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="ml-auto">
                <Badge
                  variant={
                    item.tone === "destructive" ? "destructive" : "warning"
                  }
                >
                  {item.value}
                </Badge>
                <IconArrowRight className="size-4" aria-hidden />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">
          {powerLiteCopy.noOwnerNews}
        </p>
      )}
    </AppSection>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<FinanceOverviewSearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const params = parseFinanceParams(rawParams);
  const resolved = resolveFinanceRange(params);
  const [cockpit, cash] = await Promise.all([
    fetchFinanceCockpit(params, resolved),
    fetchCashSummary(),
  ]);
  const grossProfit = cockpit.kpis.grossProfit;
  const operatingResult = cockpit.kpis.operatingResult;

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={powerLiteCopy.title}
      />

      <FilterBar
        params={params}
        branches={cockpit.branches}
        basePath="/finance"
        ranges={HKD_RANGES}
        hide={["granularity", "compare"]}
        compact
      />

      <AppSection
        size="sm"
        title={financeCopy.basic.sections.periodResult}
        description={financeCopy.basic.sections.followsFilters}
      >
        <KpiRow
          density="compact"
          className="grid-cols-1 md:grid-cols-2 xl:grid-cols-5"
        >
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.netRevenue}
            value={formatVND(cockpit.kpis.netRevenueBeforeVat)}
            hint={financeCopy.basic.kpis.netRevenueHint}
            tone="primary"
            href="/finance/revenue"
          />

          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.ingredientCost}
            value={
              cockpit.kpis.costAvailable
                ? formatVND(cockpit.kpis.ingredientCost)
                : financeCopy.basic.kpis.missingCost
            }
            hint={financeCopy.basic.kpis.ingredientCostHint(
              formatCount(cockpit.kpis.costCoverageOrderCount),
              formatCount(cockpit.kpis.orderCount),
            )}
            tone={cockpit.kpis.costAvailable ? "neutral" : "warning"}
            href="/finance/food-cost"
          />

          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.grossProfit}
            value={
              grossProfit == null
                ? financeCopy.basic.kpis.notCalculated
                : formatVND(grossProfit)
            }
            hint={
              grossProfit == null || cockpit.kpis.grossMargin == null
                ? financeCopy.basic.kpis.grossProfitMissingHint
                : financeCopy.basic.kpis.grossProfitHint(
                    formatPercent(cockpit.kpis.grossMargin),
                  )
            }
            tone={
              grossProfit == null
                ? "warning"
                : grossProfit < 0
                  ? "destructive"
                  : "success"
            }
            href="/finance/food-cost"
          />

          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.operatingExpense}
            value={
              cockpit.kpis.operatingExpenseRecorded
                ? formatVND(cockpit.kpis.operatingExpense)
                : financeCopy.basic.kpis.notRecorded
            }
            hint={financeCopy.basic.kpis.operatingExpenseHint}
            tone={
              cockpit.kpis.operatingExpenseRecorded ? "neutral" : "warning"
            }
            href="/finance/expenses"
          />

          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.operatingResult}
            value={
              operatingResult == null
                ? financeCopy.basic.kpis.notCalculated
                : formatVND(operatingResult)
            }
            hint={financeCopy.basic.kpis.operatingResultHint}
            tone={
              operatingResult == null
                ? "warning"
                : operatingResult < 0
                  ? "destructive"
                  : "success"
            }
          />
        </KpiRow>
      </AppSection>

      <CurrentFundsSection cash={cash} />

      <AppSection
        size="sm"
        title={financeCopy.basic.sections.inventory}
        description={financeCopy.basic.sections.followsFilters}
      >
        <KpiRow
          density="compact"
          className="grid-cols-1 md:grid-cols-2 xl:grid-cols-2"
        >
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.inventoryClosingValue}
            value={formatVND(cockpit.kpis.inventoryValue)}
            hint={financeCopy.basic.kpis.inventoryValueHint(
              formatVND(cockpit.kpis.inventoryOpeningValue),
            )}
          />
        </KpiRow>
      </AppSection>

      <FinanceAttentionSection exceptions={cockpit.exceptions} />
    </AppPage>
  );
}
