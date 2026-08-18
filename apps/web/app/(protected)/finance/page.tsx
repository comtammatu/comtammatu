import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight as IconArrowRight } from "lucide-react";
import {
  formatAccountingVND as formatVND,
  formatCompactVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Frame } from "@comtammatu/ui/components/frame";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { FilterBar } from "./components/filter-bar";
import { FinancePeriodFormulaShell } from "./components/finance-period-formula-shell";
import { financeHref, parseFinanceParams, resolveFinanceRange } from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceException,
} from "./_lib/finance-cockpit";
import type { FinanceOverviewSearchParams } from "./_lib/finance-overview-types";
import { CurrentFundsSection } from "./components/current-funds-section";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  clampProgressValue,
  isSingleCalendarMonth,
  monthStartFromIsoDate,
  targetProgressTone,
} from "./_lib/revenue-target";
import {
  fetchBranchRevenueTargetProgress,
  listBranchRevenueTargetProgress,
} from "./targets/actions";
import { currentUserHasPermissionAny } from "@/_lib/permissions";

const financeCopy = messages.finance;
const powerLiteCopy = financeCopy.powerLite;
const FINANCE_ATTENTION_ID = "finance-attention";
const formulaOperatorClass =
  "flex min-h-6 items-center justify-center font-heading text-lg font-semibold text-muted-foreground xl:min-h-0 xl:self-center";

function actionableExceptions(exceptions: FinanceException[]) {
  return exceptions.filter(
    (item): item is FinanceException & { href: string } =>
      item.tone !== "neutral" && item.href != null,
  );
}

function FinanceAttentionSection({
  exceptions,
}: {
  exceptions: FinanceException[];
}) {
  const actionable = actionableExceptions(exceptions);
  const needsWork = actionable.length > 0;

  return (
    <div id={FINANCE_ATTENTION_ID} className="scroll-mt-20">
      <AppSection size="sm" title={powerLiteCopy.ownerNewsTitle}>
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
                  {item.hint ? (
                    <ItemDescription className="line-clamp-none">
                      {item.hint}
                    </ItemDescription>
                  ) : null}
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
    </div>
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
  const [cockpit, canManageTargets] = await Promise.all([
    fetchFinanceCockpit(params, resolved, { includeCash: true }),
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW),
  ]);
  if (!cockpit.cash) {
    throw new Error("Finance hub requires current funds");
  }
  const cash = cockpit.cash;
  const showTargetProgress = isSingleCalendarMonth(
    resolved.start,
    resolved.end,
  );
  const yearMonth = monthStartFromIsoDate(resolved.start);
  const targetProgressRes = showTargetProgress
    ? params.location === "company"
      ? null
      : params.branch != null
        ? await fetchBranchRevenueTargetProgress(params.branch, yearMonth)
        : await listBranchRevenueTargetProgress(yearMonth)
    : null;

  let targetHint: ReactNode = null;
  let netRevenueHref = financeHref("/finance/revenue", params);
  if (showTargetProgress && targetProgressRes?.success) {
    if (
      params.branch != null &&
      targetProgressRes.data &&
      !Array.isArray(targetProgressRes.data)
    ) {
      const progress = targetProgressRes.data;
      if (progress.targetAmount != null && progress.progressPct != null) {
        const tone = targetProgressTone(progress.progressPct);
        targetHint = (
          <div className="flex w-full flex-col gap-1.5">
            <span>
              {messages.finance.revenueTargets.progress.netRevenueProgressHint(
                formatPercent(progress.progressPct),
              )}
            </span>
            <Progress
              value={clampProgressValue(progress.progressPct)}
              tone={
                tone === "neutral"
                  ? "default"
                  : (tone as "success" | "warning" | "destructive")
              }
              className="h-1.5 rounded-full"
            />
          </div>
        );
      } else if (canManageTargets) {
        targetHint = (
          <Link
            href="/finance/targets"
            className="text-primary underline-offset-2 hover:underline"
          >
            {messages.finance.revenueTargets.progress.noTarget}
          </Link>
        );
      }
      netRevenueHref = financeHref("/finance/revenue", {
        ...params,
        range: "mtd",
        period: null,
        from: null,
        to: null,
      });
    } else if (Array.isArray(targetProgressRes.data)) {
      const withTarget = targetProgressRes.data.filter(
        (row) => row.targetAmount != null && row.targetAmount > 0,
      );
      const totalNet = withTarget.reduce((sum, row) => sum + row.netRevenue, 0);
      const totalTarget = withTarget.reduce(
        (sum, row) => sum + (row.targetAmount ?? 0),
        0,
      );
      if (totalTarget > 0) {
        const pct = (totalNet / totalTarget) * 100;
        const tone = targetProgressTone(pct);
        targetHint = (
          <div className="flex w-full flex-col gap-1.5">
            <span>
              {messages.finance.revenueTargets.progress.netRevenueProgressHint(
                formatPercent(pct),
              )}
            </span>
            <Progress
              value={clampProgressValue(pct)}
              tone={
                tone === "neutral"
                  ? "default"
                  : (tone as "success" | "warning" | "destructive")
              }
              className="h-1.5 rounded-full"
            />
          </div>
        );
      }
      netRevenueHref = financeHref("/finance/revenue", {
        ...params,
        range: "mtd",
        period: null,
        from: null,
        to: null,
      });
    }
  }

  const grossProfit = cockpit.kpis.grossProfit;
  const operatingResult = cockpit.kpis.operatingResult;
  const inventoryChange = cockpit.kpis.inventoryChange;
  const showInventoryChange = cockpit.canViewInventoryValuation;
  const goodsInIsTransfer = cockpit.kpis.goodsInKind === "inbound_transfer";
  const attentionItems = actionableExceptions(cockpit.exceptions);
  const attentionCount = attentionItems.length;

  function renderGrossProfitCard() {
    return (
      <KpiCard
        density="compact"
        label={financeCopy.basic.kpis.grossProfit}
        value={
          grossProfit == null
            ? financeCopy.basic.kpis.notCalculated
            : formatVND(grossProfit)
        }
        shortValue={
          grossProfit == null ? undefined : formatCompactVND(grossProfit)
        }
        tone={
          grossProfit == null
            ? "warning"
            : grossProfit < 0
              ? "destructive"
              : "success"
        }
        href={financeHref("/finance/food-cost", params)}
      />
    );
  }

  function renderOperatingResultCard() {
    return (
      <KpiCard
        density="compact"
        label={financeCopy.basic.kpis.operatingResult}
        value={
          operatingResult == null
            ? financeCopy.basic.kpis.notCalculated
            : formatVND(operatingResult)
        }
        shortValue={
          operatingResult == null
            ? undefined
            : formatCompactVND(operatingResult)
        }
        tone={
          operatingResult == null
            ? "warning"
            : operatingResult < 0
              ? "destructive"
              : "success"
        }
      />
    );
  }

  const grossProfitDetails = (
    <KpiRow
      density="compact"
      className="grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <div className="min-w-0 md:grid md:gap-2 xl:contents">
        <span
          className="min-h-0 md:min-h-6 xl:absolute xl:size-0"
          aria-hidden
        />
        <KpiCard
          density="compact"
          label={financeCopy.basic.kpis.netRevenue}
          value={formatVND(cockpit.kpis.netRevenueBeforeVat)}
          shortValue={formatCompactVND(cockpit.kpis.netRevenueBeforeVat)}
          hint={targetHint}
          tone="primary"
          href={netRevenueHref}
        />
      </div>

      <div className="grid min-w-0 gap-2 xl:contents">
        <span className={formulaOperatorClass}>
          <span aria-hidden>−</span>
          <span className="sr-only">
            {financeCopy.basic.operators.subtract}
          </span>
        </span>
        <KpiCard
          density="compact"
          label={financeCopy.basic.kpis.ingredientCost}
          value={
            cockpit.kpis.costAvailable
              ? formatVND(cockpit.kpis.ingredientCost)
              : financeCopy.basic.kpis.missingCost
          }
          shortValue={
            cockpit.kpis.costAvailable
              ? formatCompactVND(cockpit.kpis.ingredientCost)
              : undefined
          }
          hint={financeCopy.basic.kpis.ingredientCostHint(
            formatCount(cockpit.kpis.costCoverageOrderCount),
            formatCount(cockpit.kpis.orderCount),
          )}
          tone={cockpit.kpis.costAvailable ? "neutral" : "warning"}
          href={financeHref("/finance/food-cost", params)}
        />
      </div>

      <div className="grid min-w-0 gap-2 xl:contents">
        <span className={formulaOperatorClass}>
          <span aria-hidden>=</span>
          <span className="sr-only">
            {financeCopy.basic.operators.equals}
          </span>
        </span>
        {renderGrossProfitCard()}
      </div>
    </KpiRow>
  );

  const periodResultDetails = (
    <KpiRow
      density="compact"
      className={
        showInventoryChange
          ? "grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
          : "grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)_auto_minmax(0,1fr)]"
      }
    >
      <div className="min-w-0 md:grid md:gap-2 xl:contents">
        <span
          className="min-h-0 md:min-h-6 xl:absolute xl:size-0"
          aria-hidden
        />
        <KpiCard
          density="compact"
          label={financeCopy.basic.kpis.netRevenue}
          value={formatVND(cockpit.kpis.netRevenueBeforeVat)}
          shortValue={formatCompactVND(cockpit.kpis.netRevenueBeforeVat)}
          tone="primary"
          href={netRevenueHref}
        />
      </div>

      <div className="grid min-w-0 gap-2 xl:contents">
        <span className={formulaOperatorClass}>
          <span aria-hidden>−</span>
          <span className="sr-only">
            {financeCopy.basic.operators.subtract}
          </span>
        </span>
        <Frame className="grid gap-2 p-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {financeCopy.basic.kpis.periodCost}
          </p>
          <KpiCard
            density="compact"
            label={
              goodsInIsTransfer
                ? financeCopy.basic.kpis.inboundTransfer
                : financeCopy.basic.kpis.inventoryPurchases
            }
            value={formatVND(cockpit.kpis.goodsIn)}
            shortValue={formatCompactVND(cockpit.kpis.goodsIn)}
            tone="neutral"
            href={
              goodsInIsTransfer
                ? "/inventory/transfers"
                : financeHref("/finance/supplier-invoices", params)
            }
          />
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.operatingExpense}
            value={
              cockpit.kpis.operatingExpenseRecorded
                ? formatVND(cockpit.kpis.operatingExpense)
                : financeCopy.basic.kpis.notRecorded
            }
            shortValue={
              cockpit.kpis.operatingExpenseRecorded
                ? formatCompactVND(cockpit.kpis.operatingExpense)
                : undefined
            }
            tone={
              cockpit.kpis.operatingExpenseRecorded ? "neutral" : "warning"
            }
            href={financeHref("/finance/expenses", params, {
              state: cockpit.kpis.operatingExpenseRecorded
                ? null
                : "pending",
            })}
          />
        </Frame>
      </div>

      {showInventoryChange ? (
        <div className="grid min-w-0 gap-2 xl:contents">
          <span className={formulaOperatorClass}>
            <span aria-hidden>+</span>
            <span className="sr-only">
              {financeCopy.basic.operators.add}
            </span>
          </span>
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.inventoryChange}
            value={formatVND(inventoryChange)}
            shortValue={formatCompactVND(inventoryChange)}
            tone="neutral"
          />
        </div>
      ) : null}

      <div className="grid min-w-0 gap-2 xl:contents">
        <span className={formulaOperatorClass}>
          <span aria-hidden>=</span>
          <span className="sr-only">
            {financeCopy.basic.operators.equals}
          </span>
        </span>
        {renderOperatingResultCard()}
      </div>
    </KpiRow>
  );

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={powerLiteCopy.title}
        badge={
          attentionCount > 0
            ? {
                children: powerLiteCopy.attentionBadge(
                  formatCount(attentionCount),
                ),
                variant: "warning",
              }
            : undefined
        }
        actions={
          attentionCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={`#${FINANCE_ATTENTION_ID}`} />}
            >
              {powerLiteCopy.viewAttention}
            </Button>
          ) : null
        }
      />

      {/* DASHBOARD_REPORT: non-sticky FilterBar above KPI mosaic — never AppListFrame. */}
      <FilterBar
        params={params}
        branches={cockpit.branches}
        basePath="/finance"
        hide={["branch", "granularity", "compare"]}
      />

      <AppSection size="sm" title={financeCopy.basic.sections.grossProfit}>
        <FinancePeriodFormulaShell
          summary={renderGrossProfitCard()}
          details={grossProfitDetails}
        />
      </AppSection>

      <AppSection size="sm" title={financeCopy.basic.sections.periodResult}>
        <FinancePeriodFormulaShell
          summary={renderOperatingResultCard()}
          details={periodResultDetails}
        />
      </AppSection>

      <AppSection size="sm" title={financeCopy.basic.sections.startupCapital}>
        <KpiRow
          density="compact"
          className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1"
        >
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.startupCapital}
            value={
              cockpit.kpis.startupCapitalRecorded
                ? formatVND(cockpit.kpis.startupCapital)
                : financeCopy.basic.kpis.notRecorded
            }
            shortValue={
              cockpit.kpis.startupCapitalRecorded
                ? formatCompactVND(cockpit.kpis.startupCapital)
                : undefined
            }
            href={financeHref("/finance/expenses", params)}
          />
        </KpiRow>
      </AppSection>

      <CurrentFundsSection cash={cash} />

      {cockpit.canViewInventoryValuation ? (
        <AppSection size="sm" title={financeCopy.basic.sections.inventory}>
          <KpiRow
            density="compact"
            className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1"
          >
            <KpiCard
              density="compact"
              label={financeCopy.basic.kpis.inventoryClosingValue}
              value={formatVND(cockpit.kpis.inventoryValue)}
              shortValue={formatCompactVND(cockpit.kpis.inventoryValue)}
              hint={financeCopy.basic.kpis.inventoryValueHint(
                formatVND(cockpit.kpis.inventoryOpeningValue),
              )}
            />
          </KpiRow>
        </AppSection>
      ) : null}

      <AppSection size="sm" title={financeCopy.basic.sections.vat}>
        <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2">
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.vatInput}
            value={
              cockpit.vat.inputRecorded == null
                ? financeCopy.basic.kpis.vatUnavailable
                : formatVND(cockpit.vat.inputRecorded)
            }
            shortValue={
              cockpit.vat.inputRecorded == null
                ? undefined
                : formatCompactVND(cockpit.vat.inputRecorded)
            }
            href={financeHref("/finance/supplier-invoices", params)}
          />
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.vatOutput}
            value={
              cockpit.vat.outputIssued == null
                ? financeCopy.basic.kpis.vatUnavailable
                : formatVND(cockpit.vat.outputIssued)
            }
            shortValue={
              cockpit.vat.outputIssued == null
                ? undefined
                : formatCompactVND(cockpit.vat.outputIssued)
            }
            href={financeHref("/finance/invoices", params)}
          />
        </KpiRow>
      </AppSection>

      <FinanceAttentionSection exceptions={cockpit.exceptions} />
    </AppPage>
  );
}
