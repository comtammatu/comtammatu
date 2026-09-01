import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import {
  formatAccountingVND as formatVND,
  formatCompactVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import { addMoney, roundToCanonicalMoney } from "@comtammatu/shared/money";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { ChevronRight as IconChevronRight } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Frame } from "@comtammatu/ui/components/frame";
import { cn } from "@comtammatu/ui/lib/utils";
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
import { FinancePeriodFormulaShell } from "./components/finance-period-formula-shell";
import { financeHref, parseFinanceParams, resolveFinanceRange, type FinanceParams } from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceException,
} from "./_lib/finance-cockpit";
import type { PeriodReadinessRpc } from "./_lib/finance-period-readiness";
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
const formulaOperatorClass =
  "flex min-h-6 items-center justify-center font-heading text-lg font-semibold text-muted-foreground xl:min-h-0 xl:self-center";

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<FinanceOverviewSearchParams>;
}) {
  await connection();
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
    }
  }

  const grossProfit = cockpit.kpis.grossProfit;
  const operatingResult = cockpit.kpis.operatingResult;
  const inventoryChange = cockpit.kpis.inventoryChange;
  const showInventoryChange = cockpit.canViewInventoryValuation;
  const goodsInIsTransfer = cockpit.kpis.goodsInKind === "inbound_transfer";

  // Period-close readiness (Sức khoẻ chốt sổ) surfaces as ONE aggregated
  // read-only exception item on the landing; it never exposes a close or
  // reopen action, and stays hidden when both counts are zero.
  function buildReadinessException(
    readiness: PeriodReadinessRpc | null,
    scope: FinanceParams,
  ): FinanceException | null {
    if (readiness == null) return null;
    if (readiness.blockerCount <= 0 && readiness.warningCount <= 0) {
      return null;
    }
    const findings = [...readiness.blockers, ...readiness.warnings];
    // Unknown finding codes are omitted: only registered copy renders.
    const hint = findings
      .map(
        (finding) =>
          financeCopy.basic.exceptions.readinessCodes[finding.code],
      )
      .filter((label): label is string => typeof label === "string")
      .join(" · ");
    const blockerCodes = new Set(
      readiness.blockers.map((finding) => finding.code),
    );
    const findingCodes = new Set(findings.map((finding) => finding.code));
    const href = blockerCodes.has("operating_expense_missing")
      ? financeHref("/finance/expenses", scope, { state: "pending" })
      : findingCodes.has("bank_reconciliation_open")
        ? financeHref("/finance/bank-transactions", scope, {
            recon: "needs_review",
          })
        : undefined;
    return {
      label: financeCopy.basic.exceptions.readinessLabel,
      value: financeCopy.basic.exceptions.readinessValue(
        formatCount(readiness.blockerCount),
        formatCount(readiness.warningCount),
      ),
      hint,
      href,
      tone: readiness.blockerCount > 0 ? "destructive" : "warning",
    };
  }

  const readinessException = buildReadinessException(cockpit.readiness, params);
  // General cockpit exceptions stay on `/` and list queues (finance.md);
  // the landing surfaces only the period-close readiness item.
  const attentionExceptions = readinessException ? [readinessException] : [];

  const netRevenueValue = Number(cockpit.kpis.netRevenueBeforeVat);
  const hasNetRevenue = Number.isFinite(netRevenueValue) && netRevenueValue > 0;

  const grossProfitMarginPct =
    hasNetRevenue && grossProfit != null
      ? (Number(grossProfit) / netRevenueValue) * 100
      : null;

  const operatingResultMarginPct =
    hasNetRevenue && operatingResult != null
      ? (Number(operatingResult) / netRevenueValue) * 100
      : null;

  const ingredientCostPct =
    hasNetRevenue && cockpit.kpis.ingredientCost != null
      ? (Number(cockpit.kpis.ingredientCost) / netRevenueValue) * 100
      : null;

  function renderGrossProfitCard() {
    const coverageIncomplete = !cockpit.kpis.costAvailable;
    const marginLabel =
      grossProfitMarginPct != null
        ? `Biên gộp ${formatPercent(grossProfitMarginPct)}`
        : undefined;
    const hint = coverageIncomplete
      ? [marginLabel, financeCopy.basic.kpis.grossProfitMissingHint]
          .filter(Boolean)
          .join(" · ")
      : marginLabel;
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
        hint={hint}
        tone={
          grossProfit == null || coverageIncomplete
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
    const marginLabel =
      operatingResultMarginPct != null
        ? `Biên ròng ${formatPercent(operatingResultMarginPct)}`
        : undefined;
    const baseHint = showInventoryChange
      ? financeCopy.basic.kpis.operatingResultHint
      : financeCopy.basic.kpis.operatingResultHintWithoutInventory;
    const hint = [marginLabel, baseHint].filter(Boolean).join(" · ");
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
        hint={hint}
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
            cockpit.kpis.grossProfit == null
              ? financeCopy.basic.kpis.notCalculated
              : formatVND(cockpit.kpis.ingredientCost)
          }
          shortValue={
            cockpit.kpis.grossProfit == null
              ? undefined
              : formatCompactVND(cockpit.kpis.ingredientCost)
          }
          hint={
            cockpit.kpis.costAvailable
              ? [
                  ingredientCostPct != null
                    ? `${formatPercent(ingredientCostPct)} DT`
                    : null,
                  financeCopy.basic.kpis.ingredientCostHint(
                    formatCount(cockpit.kpis.costCoverageOrderCount),
                    formatCount(cockpit.kpis.orderCount),
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : financeCopy.basic.kpis.missingCost(
                  formatCount(
                    Math.max(
                      0,
                      cockpit.kpis.orderCount -
                        cockpit.kpis.costCoverageOrderCount,
                    ),
                  ),
                )
          }
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

  const isBranchScope = params.location === "branch" && params.branch != null;
  const branchBook = isBranchScope
    ? (cash.branches.find((branch) => branch.branchId === params.branch) ??
      null)
    : null;
  const fundsReady = isBranchScope
    ? Boolean(branchBook?.hasOpening) && cash.hasCompanyOpening
    : cash.hasCompanyOpening && cash.branchesComplete;
  const totalOnHand = addMoney([
    roundToCanonicalMoney(
      isBranchScope ? (branchBook?.cashOnHand ?? 0) : cash.cashOnHand,
    ),
    roundToCanonicalMoney(cash.bankOnHand),
  ]);
  const totalAssetValue = addMoney([
    totalOnHand,
    ...(cockpit.canViewInventoryValuation
      ? [roundToCanonicalMoney(cockpit.kpis.inventoryValue)]
      : []),
    cockpit.kpis.equipmentRecorded
      ? roundToCanonicalMoney(cockpit.kpis.equipment)
      : "0.00",
  ]);

  const totalAssetValueDetails = (
    <KpiRow
      density="compact"
      className={
        cockpit.canViewInventoryValuation
          ? "grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
          : "grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
      }
    >
      <div className="min-w-0 md:grid md:gap-2 xl:contents">
        <span
          className="min-h-0 md:min-h-6 xl:absolute xl:size-0"
          aria-hidden
        />
        <KpiCard
          density="compact"
          label={financeCopy.basic.kpis.totalOnHand}
          value={
            fundsReady
              ? formatVND(totalOnHand)
              : messages.finance.cash.verifying
          }
          shortValue={
            fundsReady ? formatCompactVND(totalOnHand) : undefined
          }
          tone={fundsReady ? "primary" : "warning"}
        />
      </div>

      {cockpit.canViewInventoryValuation ? (
        <div className="grid min-w-0 gap-2 xl:contents">
          <span className={formulaOperatorClass}>
            <span aria-hidden>+</span>
            <span className="sr-only">
              {financeCopy.basic.operators.add}
            </span>
          </span>
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.inventoryClosingValue}
            value={formatVND(cockpit.kpis.inventoryValue)}
            shortValue={formatCompactVND(cockpit.kpis.inventoryValue)}
            hint={financeCopy.basic.kpis.inventoryValueHint(
              formatVND(cockpit.kpis.inventoryOpeningValue),
            )}
          />
        </div>
      ) : null}

      <div className="grid min-w-0 gap-2 xl:contents">
        <span className={formulaOperatorClass}>
          <span aria-hidden>+</span>
          <span className="sr-only">
            {financeCopy.basic.operators.add}
          </span>
        </span>
        <KpiCard
          density="compact"
          label={financeCopy.basic.kpis.equipment}
          value={
            cockpit.kpis.startupCapitalLoadFailed
              ? // `vatUnavailable` is intentionally reused as the generic
                // "data load failed" copy for finance KPI cards.
                financeCopy.basic.kpis.vatUnavailable
              : cockpit.kpis.equipmentRecorded
                ? formatVND(cockpit.kpis.equipment)
                : financeCopy.basic.kpis.notRecorded
          }
          shortValue={
            cockpit.kpis.equipmentRecorded
              ? formatCompactVND(cockpit.kpis.equipment)
              : undefined
          }
          href={financeHref("/finance/equipment", params)}
        />
      </div>

      <div className="grid min-w-0 gap-2 xl:contents">
        <span className={formulaOperatorClass}>
          <span aria-hidden>=</span>
          <span className="sr-only">
            {financeCopy.basic.operators.equals}
          </span>
        </span>
        {renderTotalAssetValueCard()}
      </div>
    </KpiRow>
  );

  function renderTotalAssetValueCard() {
    return (
      <KpiCard
        density="compact"
        label={financeCopy.basic.kpis.totalAssetValue}
        value={
          fundsReady
            ? formatVND(totalAssetValue)
            : messages.finance.cash.verifying
        }
        shortValue={
          fundsReady ? formatCompactVND(totalAssetValue) : undefined
        }
        tone={fundsReady ? "primary" : "warning"}
      />
    );
  }

  const goodsInPct =
    hasNetRevenue && cockpit.kpis.goodsIn != null
      ? (Number(cockpit.kpis.goodsIn) / netRevenueValue) * 100
      : null;

  const operatingExpensePct =
    hasNetRevenue &&
    cockpit.kpis.operatingExpenseRecorded &&
    cockpit.kpis.operatingExpense != null
      ? (Number(cockpit.kpis.operatingExpense) / netRevenueValue) * 100
      : null;

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
            hint={
              goodsInPct != null
                ? `${formatPercent(goodsInPct)} DT`
                : undefined
            }
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
            hint={
              operatingExpensePct != null
                ? `${formatPercent(operatingExpensePct)} DT`
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
    <AppPage width="wide" density="compact" className="pb-4">
      <AppPageHeader title={powerLiteCopy.title} />

      {/* DASHBOARD_REPORT: non-sticky FilterBar above KPI mosaic — never AppListFrame. */}
      <FilterBar
        params={params}
        branches={cockpit.branches}
        basePath="/finance"
        locationFilter
        hide={["granularity", "compare"]}
      />

      {/* Radar Cảnh Báo: đưa lên ngay sau FilterBar để đập vào mắt chủ sở hữu trong 5 giây đầu */}
      {attentionExceptions.length > 0 ? (
        <AppSection size="sm" title={powerLiteCopy.exceptionsTitle}>
          <ItemGroup>
            {attentionExceptions.map((item, index) => (
              <Item
                key={`${item.label}:${index}`}
                variant="outline"
                size="sm"
                className={cn(
                  "border-l-4 transition-colors",
                  item.tone === "destructive"
                    ? "border-l-destructive bg-destructive/10 border-destructive/20 hover:bg-destructive/15"
                    : "border-l-warning bg-warning/10 border-warning/20 hover:bg-warning/15",
                )}
                render={
                  item.href != null ? <Link href={item.href} /> : undefined
                }
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none font-semibold text-foreground">
                    {item.label}
                  </ItemTitle>
                  {item.hint.length > 0 ? (
                    <ItemDescription className="line-clamp-none text-muted-foreground">
                      {item.hint}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
                <ItemActions className="ml-auto flex items-center gap-2">
                  <Badge
                    variant={
                      item.tone === "destructive" ? "destructive" : "warning"
                    }
                  >
                    {item.value}
                  </Badge>
                  {item.href != null ? (
                    <IconChevronRight className="size-4 text-muted-foreground shrink-0" />
                  ) : null}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </AppSection>
      ) : null}

      {/* LỢI NHUẬN GỘP & GIÁ VỐN MÓN: Hiệu quả kinh doanh món ăn */}
      <AppSection size="sm" title={financeCopy.basic.sections.grossProfit}>
        <FinancePeriodFormulaShell
          summary={renderGrossProfitCard()}
          details={grossProfitDetails}
        />
      </AppSection>

      {/* KẾT QUẢ KINH DOANH (HERO): Tiền lời/lỗ thực nhận sau khi trừ mọi chi phí */}
      <AppSection size="sm" title={financeCopy.basic.sections.periodResult}>
        <FinancePeriodFormulaShell
          summary={renderOperatingResultCard()}
          details={periodResultDetails}
        />
      </AppSection>

      {/* TÀI SẢN & KÉT TIỀN: Tiền mặt két chi nhánh + Tiền tài khoản công ty */}
      <CurrentFundsSection
        cash={cash}
        location={params.location}
        selectedBranchId={params.branch}
        title={financeCopy.basic.sections.assets}
      >
        <FinancePeriodFormulaShell
          summary={renderTotalAssetValueCard()}
          details={totalAssetValueDetails}
        />
      </CurrentFundsSection>

      {/* CHI PHÍ BAN ĐẦU: Thi công, tài sản, đặt cọc ban đầu */}
      <AppSection size="sm" title={financeCopy.basic.sections.startupCapital}>
        <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.startupCapital}
            value={
              cockpit.kpis.startupCapitalLoadFailed
                ? // `vatUnavailable` is intentionally reused as the generic
                  // "data load failed" copy for finance KPI cards.
                  financeCopy.basic.kpis.vatUnavailable
                : cockpit.kpis.startupCapitalRecorded
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
    </AppPage>
  );
}
